const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterAbstract = require('../lib/RateLimiterAbstract');

describe('RateLimiterAbstract', function () {
  this.timeout(5000);

  it('do not prefix key, if keyPrefix is empty string', () => {
    const testKey = 'test1';
    const rateLimiter = new RateLimiterAbstract({ keyPrefix: '' });
    expect(rateLimiter.getKey(testKey)).to.equal(testKey);
  });
});
