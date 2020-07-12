const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterQueueError = require('../../lib/component/RateLimiterQueueError');

describe('RateLimiterQueueError', function RateLimiterQueueErrorTest() {
  it('supports extra argument in constructor', (done) => {
    const err = new RateLimiterQueueError('test', 'extra')
    expect(err.extra).to.equal('extra');
    done();
  });
});
