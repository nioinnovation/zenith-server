'use strict';

const Joi = require('joi');

const server = Joi.object({
  rdb_host: Joi.string().hostname().default('localhost'),
  rdb_port: Joi.number().greater(0).less(65536).default(28015),

  auto_create_table: Joi.boolean().default(false),
  auto_create_index: Joi.boolean().default(false),

  path: Joi.string().default('/horizon'),

  db: Joi.string().token().default('horizon'),

  auth: Joi.object().default({ }),
}).unknown(false);

const auth = Joi.object({
  success_redirect: Joi.string().default('/'),
  failure_redirect: Joi.string().default('/'),

  duration: Joi.alternatives(Joi.string(), Joi.number().positive()).default('1d'),

  create_new_users: Joi.boolean().default(true),
  new_user_group: Joi.string().default('default'),

  token_secret: Joi.string().allow(null),
  allow_anonymous: Joi.boolean().default(false),
  allow_unauthenticated: Joi.boolean().default(false),
}).unknown(false);

module.exports = { server, auth };
