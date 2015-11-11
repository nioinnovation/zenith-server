'use strict';

const assert = require('assert');
const protocol = require('../src/schema/protocol');

describe('Schema', () => {

  it('request', (done) => {
    const request = {
      request_id: 1,
      type: 'query',
      options: {}
    };

    var { error, value } = protocol.request.validate(request);

    assert.ifError(error);
    assert(value);

    done();
  });

  it('query - options', (done) => {
    const options = {
      collection: 'fusion',
      field_name: 'id',
      selection: {
        type: 'find_one',
        args: [ 1 ]
      },
      // limit: 1,
      // order: 'ascending'
    };

    var { error, value } = protocol.read.validate(options);

    assert.ifError(error);
    assert(value);
    assert.equal(value.field_name, 'id');
    assert.deepEqual(value.selection.args, [1]);

    done();
  });

});
