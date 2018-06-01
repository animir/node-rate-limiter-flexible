const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const RateLimiterRes = require('../lib/RateLimiterRes');

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

  it('consumed points set and get', () => {
    rateLimiterRes.consumedPoints = 5;
    expect(rateLimiterRes.consumedPoints).to.equal(5);
  });

  it('isFirstInDuration set and get with cast', () => {
    rateLimiterRes.isFirstInDuration = 1;
    expect(rateLimiterRes.isFirstInDuration).to.equal(true);
  });
});
