const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterAbstract = require('../lib/RateLimiterAbstract');

describe('RateLimiterAbstract', function () {
  this.timeout(5000);

  it('do not prefix key, if keyPrefix is empty string', () => {
    const testKey = 'test1';
    const rateLimiter = new RateLimiterAbstract({ keyPrefix: '', points: 4, duration: 1 });
    expect(rateLimiter.getKey(testKey)).to.equal(testKey);
  });

  it('accepts number as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 10, duration: 1 });
    expect(rateLimiter.points).to.equal(10);
  });

  it('accepts zero as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 0, duration: 1 });
    expect(rateLimiter.points).to.equal(0);
  });

  it('accepts negative number as points value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: -5, duration: 1 });
    expect(rateLimiter.points).to.equal(-5);
  });

  it('throws error if points is not set', () => {
    expect(() => {
      new RateLimiterAbstract({ duration: 1 });
    }).to.throw('points must be set and must be a number');
  });

  it('throws error if points is null', () => {
    expect(() => {
      new RateLimiterAbstract({ points: null, duration: 1 });
    }).to.throw('points must be set and must be a number');
  });

  it('throws error if points is a string', () => {
    expect(() => {
      new RateLimiterAbstract({ points: '10', duration: 1 });
    }).to.throw('points must be set and must be a number');
  });

  it('throws error if points is an object', () => {
    expect(() => {
      new RateLimiterAbstract({ points: {}, duration: 1 });
    }).to.throw('points must be set and must be a number');
  });

  it('throws error if points is a boolean', () => {
    expect(() => {
      new RateLimiterAbstract({ points: true, duration: 1 });
    }).to.throw('points must be set and must be a number');
  });

  it('accepts positive number as duration value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 5 });
    expect(rateLimiter.duration).to.equal(5);
  });

  it('accepts zero as duration value', () => {
    const rateLimiter = new RateLimiterAbstract({ points: 4, duration: 0 });
    expect(rateLimiter.duration).to.equal(0);
  });

  it('throws error if duration is not set', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4 });
    }).to.throw('duration must be set and must be a non-negative number');
  });

  it('throws error if duration is negative', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: -1 });
    }).to.throw('duration must be set and must be a non-negative number');
  });

  it('throws error if duration is null', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: null });
    }).to.throw('duration must be set and must be a non-negative number');
  });

  it('throws error if duration is a string', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: '5' });
    }).to.throw('duration must be set and must be a non-negative number');
  });

  it('throws error if duration is an object', () => {
    expect(() => {
      new RateLimiterAbstract({ points: 4, duration: {} });
    }).to.throw('duration must be set and must be a non-negative number');
  });
});
