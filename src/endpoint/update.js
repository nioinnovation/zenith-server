'use strict';

const { update } = require('../schema/fusion_protocol');
const { handle_response } = require('./remove');

const Joi = require('joi');
const r = require('rethinkdb');

const make_reql = (request) => {
  var { data, collection } = Joi.attempt(request.options, update);
  return r.expr(data).forEach((row) =>
        r.table(collection).get(row('id')).replace((old) =>
         r.branch(old.ne(null), old.merge(row),
           r.error(r.expr("The document with id '")
                    .add(row('id').coerceTo('string'))
                    .add("' was missing.")))));
}

module.exports = { make_reql, handle_response };
