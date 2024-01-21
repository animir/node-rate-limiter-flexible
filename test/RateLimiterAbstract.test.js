import mocha from "mocha";
import { expect } from "chai";
import RateLimiterAbstract from "../lib/RateLimiterAbstract.js";
const { describe, it } = mocha;

describe('RateLimiterAbstract', function () {
  this.timeout(5000);

  it('do not prefix key, if keyPrefix is empty string', () => {
    const testKey = 'test1';
    const rateLimiter = new RateLimiterAbstract({ keyPrefix: '' });
    expect(rateLimiter.getKey(testKey)).to.equal(testKey);
  });
});
