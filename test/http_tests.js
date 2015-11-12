'use strict';

const utils = require('./utils');

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const https = require('https');

const all_tests = () => {
  it('localhost/fusion.js', (done) => {
    const transport = utils.is_secure() ? https : http;
    transport.get({ hostname: 'localhost',
                    port: utils.fusion_port(),
                    path: '/fusion.js',
                    rejectUnauthorized: false }, (res) => {
      const code = fs.readFileSync('../client/dist/build.js');
      let buffer = '';
      assert.strictEqual(res.statusCode, 200);
      res.on('data', (delta) => buffer += delta);
      res.on('end', () => (assert.equal(buffer, code), done()));
    });
  });
};

const suite = (table) => describe('Webserver', () => all_tests(table));

module.exports = { suite };
