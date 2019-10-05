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

  it('returns object on toJSON call', () => {
    rateLimiterRes.msBeforeNext = 12;
    rateLimiterRes.remainingPoints = 3;
    rateLimiterRes.consumedPoints = 2;
    rateLimiterRes.isFirstInDuration = true;

    expect(rateLimiterRes.toJSON()).to.deep.equal({
      remainingPoints: 3,
      msBeforeNext: 12,
      consumedPoints: 2,
      isFirstInDuration: true,
    });
  });

  it('returns JSON string on toString call', () => {
    rateLimiterRes.msBeforeNext = 2;
    rateLimiterRes.remainingPoints = 0;
    rateLimiterRes.consumedPoints = 5;
    rateLimiterRes.isFirstInDuration = false;

    expect(rateLimiterRes.toString()).to.equal('{"remainingPoints":0,"msBeforeNext":2,"consumedPoints":5,"isFirstInDuration":false}');
  });
});
