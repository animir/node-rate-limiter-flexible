const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const RateLimiterRes = require('./RateLimiterRes');

describe('RateLimiterRes response object', () => {
  let rateLimiterRes;
  beforeEach(() => {
    rateLimiterRes = new RateLimiterRes();
  });

  it('setup defaults on construct', () => {
    expect(rateLimiterRes.msBeforeNext === 0 && rateLimiterRes.remainingPoints === 0)
      .to.be.equal(true);
  });

  it('msBeforeNext set and get', () => {
    rateLimiterRes.msBeforeNext = 123;
    expect(rateLimiterRes.msBeforeNext).to.equal(123);
  });

  it('points set and get', () => {
    rateLimiterRes.remainingPoints = 4;
    expect(rateLimiterRes.remainingPoints).to.equal(4);
  });
});
