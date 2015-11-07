'use strict';

const utils = require('./utils.js');
const logger = require('../src/server.js').logger;

// Test cases
const all_suites = [
    require('./http_tests.js'),
    require('./protocol_tests.js'),
    require('./query_tests.js'),
    require('./write_tests.js'),
    require('./subscribe_tests.js'),
    require('./prereq_tests.js')
  ];

var prepare_database = function (done) {
  this.timeout(10000); // Allow 10 seconds to create and populate tables
  var num_done = 0;
  var collector = () => ++num_done === all_suites.length ? done() : undefined;
  all_suites.forEach((suite) => {
    if (suite.prepare_database != null) suite.prepare_database(collector);
  });
};

describe('Fusion Server', () => {
  before('Start RethinkDB Server', utils.start_rdb_server);
  before('Populating Fusion database', prepare_database);

  beforeEach(function() { logger.info(`Start test '${this.currentTest.title}'`); });

  describe('HTTP:', () => {
    before('Start Fusion Server', utils.start_unsecure_fusion_server);
    after('Close Fusion Server', utils.close_fusion_server);
    beforeEach('Connect Fusion Client', utils.open_fusion_conn);
    afterEach('Close Fusion Client', utils.close_fusion_conn);

    all_suites.forEach((suite) => describe(suite.name, suite.all_tests));
  });

  describe('HTTPS:', () => {
    before('Start Fusion Server', utils.start_secure_fusion_server);
    after('Close Fusion Server', utils.close_fusion_server);
    beforeEach('Connect Fusion Client', utils.open_fusion_conn);
    afterEach('Close Fusion Client', utils.close_fusion_conn);

    all_suites.forEach((suite) => describe(suite.name, suite.all_tests));
  });
});
