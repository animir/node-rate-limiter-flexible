import mocha from "mocha";
import { expect } from "chai";
import RateLimiterUnion from "../lib/RateLimiterUnion.js";
import RateLimiterMemory from "../lib/RateLimiterMemory.js";
// eslint-disable no-unused-expressions
const { describe, it, beforeEach } = mocha;

describe('RateLimiterUnion with fixed window', () => {
  const keyPrefix1 = 'limit1';
  const keyPrefix2 = 'limit2';
  let rateLimiter;

  beforeEach(() => {
    const limiter1 = new RateLimiterMemory({
      keyPrefix: keyPrefix1,
      points: 1,
      duration: 1,
    });
    const limiter2 = new RateLimiterMemory({
      keyPrefix: keyPrefix2,
      points: 2,
      duration: 5,
    });
    rateLimiter = new RateLimiterUnion(limiter1, limiter2);
  });

  it('does not allow to create union with limiters number less than 2', () => {
    try {
      new RateLimiterUnion(new RateLimiterMemory({ // eslint-disable-line no-new
        keyPrefix: keyPrefix1,
        points: 1,
        duration: 1,
      }));
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
    }
  });

  it('all limiters have to be instance of RateLimiterAbstract', () => {
    try {
      new RateLimiterUnion(new RateLimiterMemory({ // eslint-disable-line no-new
        keyPrefix: keyPrefix1,
        points: 1,
        duration: 1,
      }), {});
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
    }
  });

  it('consume from all limiters', (done) => {
    rateLimiter.consume('test')
      .then((res) => {
        expect(res[keyPrefix1].remainingPoints === 0 && res[keyPrefix2].remainingPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reject consume one "limit1", which does not have enough points', (done) => {
    rateLimiter.consume('test', 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej[keyPrefix1].remainingPoints === 0).to.equal(true);
        done();
      });
  });

  it('reject both do not have enough points', (done) => {
    rateLimiter.consume('test', 3)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej[keyPrefix1].remainingPoints === 0 && rej[keyPrefix2].remainingPoints === 0).to.equal(true);
        done();
      });
  });
});

