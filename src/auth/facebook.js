'use strict';

const logger = require('../logger');

const cookie = require('cookie');
const crypto = require('crypto');
const extend = require('util')._extend;
const https = require('https');
const Joi = require('joi');
const querystring = require('querystring');
const url = require('url');

const options_schema = Joi.object().keys({
  app_id: Joi.string().required(),
  app_secret: Joi.string().required(),
  path: Joi.string().required(),
}).unknown(false);

// TODO: these could be moved to a common area
const do_redirect = (res, redirect_url) => {
  logger.debug(`Redirecting user to ${redirect_url}`);
  res.writeHead(302, { Location: redirect_url });
  res.end();
};

const extend_url_query = (path, query) => {
  const path_copy = extend({ }, path);
  if (path_copy.query === null) {
    path_copy.query = query;
  } else {
    path_copy.query = extend({ }, path_copy.query);
    path_copy.query = extend(path_copy.query, query);
  }
  return path_copy;
};

const do_get = (get_url, cb) => {
  logger.debug(`Facebook auth performing GET: ${get_url}`);
  https.get(get_url, (req) => {
    const chunks = [];
    req.on('data', (data) => {
      chunks.push(data);
    });
    req.on('end', () => {
      cb(null, chunks.join(''));
    });
  }).on('error', (err) => {
    cb(err);
  });
};

const try_json_parse = (data) => {
  try {
    return JSON.parse(data);
  } catch (err) {
    // Do nothing - just return undefined
  }
};

const nonce_cookie = (name) => `${name}_fusion_nonce`;

const make_nonce = (cb) => crypto.randomBytes(64, (err, res) => {
  if (!err) {
    cb(err, res.toString('base64'));
  } else {
    cb(err, res);
  }
});

const nonce_to_state = (nonce) => crypto.createHash('sha256').update(nonce, 'base64').digest('base64');

const set_nonce = (res, name, nonce) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonce_cookie(name), nonce,
                                 { maxAge: 3600, secure: true, httpOnly: true }));

const clear_nonce = (res, name) =>
  res.setHeader('set-cookie',
                cookie.serialize(nonce_cookie(name), 'invalid',
                                 { maxAge: -1, secure: true, httpOnly: true }));

const get_nonce = (req, name) => {
  const cookies = req.headers['cookie'];
  const field = nonce_cookie(name);
  if (cookies) {
    logger.debug(`Checking cookie: ${cookies}`);
    const value = cookie.parse(cookies);
    return value[field];
  }
};

const add = (fusion, raw_options) => {
  const options = Joi.attempt(raw_options, options_schema);

  logger.debug(`facebook.add options: ${JSON.stringify(options)}`);
  let app_token;

  const auth_url = (host, path) =>
    url.format({ protocol: 'https', host: host, pathname: path });

  const make_acquire_url = (redirect_uri, state) =>
    url.format({ protocol: 'https',
                 host: 'www.facebook.com',
                 pathname: '/dialog/oauth',
                 query: { client_id: options.app_id,
                          redirect_uri,
                          response_type: 'code',
                          state } });

  const make_user_token_url = (code, redirect_uri) =>
    url.format({ protocol: 'https',
                 host: 'graph.facebook.com',
                 pathname: '/v2.3/oauth/access_token',
                 query: { client_id: options.app_id,
                          client_secret: options.app_secret,
                          redirect_uri,
                          code } });

  const make_inspect_url = (input_token) =>
    url.format({ protocol: 'https',
                 host: 'graph.facebook.com',
                 pathname: '/debug_token',
                 query: { access_token: app_token,
                          input_token } });

  const make_app_token_url = () =>
    url.format({ protocol: 'https',
                 host: 'graph.facebook.com',
                 pathname: '/oauth/access_token',
                 query: { client_id: options.app_id,
                          client_secret: options.app_secret,
                          grant_type: 'client_credentials' } });

  const make_success_url = (fusion_token) =>
    url.format(extend_url_query(fusion._auth._success_redirect, { fusion_token }));

  const make_failure_url = (fusion_error) =>
    url.format(extend_url_query(fusion._auth._failure_redirect, { fusion_error }));

  do_get(make_app_token_url(), (err, body) => {
    if (err) {
      logger.error(`Failed to obtain app token: ${err}`);
      process.exit(1);
    }
    const parsed = querystring.parse(body);
    if (!parsed.access_token) {
      logger.error(`Could not parse access token from API response: ${body}`);
      process.exit(1);
    }
    app_token = parsed.access_token;
    logger.debug(`Got app access token: ${app_token}`);
  });

  fusion.add_http_handler(options.path, (req, res) => {
    const request_url = url.parse(req.url, true);
    const return_url = auth_url(req.headers.host, request_url.pathname);

    logger.debug(`Facebook request with params: ${JSON.stringify(request_url)}`);
    if (!request_url.query || !request_url.query.code) {
      // We need to redirect to the API to acquire a token, then come back and try again
      // Generate a nonce to track this client session to prevent CSRF attacks
      logger.debug('No query or code, making nonce');
      return make_nonce((nonce_err, nonce) => {
        if (nonce_err) {
          logger.error(`Error creating nonce for oauth state: ${nonce_err}`);
          res.statusCode = 503;
          return res.end('Error occurred when generating request for access token.');
        }
        set_nonce(res, fusion._name, nonce);
        return do_redirect(res, make_acquire_url(return_url, nonce_to_state(nonce)));
      });
    }

    if (app_token === undefined) {
      res.statusCode = 503;
      return res.end('Authentication API access token is not yet ready.');
    }

    // Make sure this is the same client who obtained the code to prevent CSRF attacks
    const nonce = get_nonce(req, fusion._name);
    const state = request_url.query.state;
    if (!nonce || !state || state !== nonce_to_state(nonce)) {
      if (!nonce) logger.debug('Missing nonce');
      else if (!state) logger.debug('Missing state');
      else logger.debug(`Nonce mismatch: ${state} != ${nonce_to_state(nonce)} (${nonce})`);

      return do_redirect(res, make_failure_url('Session has expired, try again.'));
    }

    // We have the user code, turn it into an access token
    do_get(make_user_token_url(request_url.query.code, return_url), (err1, body) => {
      if (err1) {
        logger.error(`Error contacting facebook API: ${err1}`);
        res.statusCode = 503;
        return res.end('Error occurred when contacting API to acquire user access token.');
      }

      const info = try_json_parse(body);
      if (!info || !info.access_token) {
        logger.error(`Bad JSON data from facebook API: ${body}`);
        res.statusCode = 500;
        return res.end('Failed to parse token acquisition response.');
      }

      // We have the user access token, get info on it so we can find the user
      do_get(make_inspect_url(info.access_token), (err2, inner_body) => {
        if (err2) {
          res.statusCode = 503;
          return res.end('Error occurred when contacting API to inspect user access token.');
        }

        // We have the user info in the body - find the corresponding account and turn it into a JWT
        const inner_info = try_json_parse(inner_body);
        if (!inner_info || !inner_info.data || !inner_info.data.user_id) {
          logger.error(`Bad JSON data from facebook API: ${inner_body}`);
          res.statusCode = 500;
          return res.end('Failed to parse token inspection response.');
        }

        fusion._auth.generate_jwt(options.path, inner_info.data.user_id, (err3, jwt) => {
          // Clear the nonce just so we aren't polluting clients' cookies
          clear_nonce(res, fusion._name);
          do_redirect(res, err3 ?
            make_failure_url('failed to find user') :
            make_success_url(jwt));
        });
      });
    });
  });
};

module.exports = add;
