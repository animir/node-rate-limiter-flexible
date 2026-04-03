const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterStoreAbstract = require('../lib/RateLimiterStoreAbstract');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const RateLimiterRes = require('../lib/RateLimiterRes');
const RLWrapperBlackAndWhite = require('../lib/RLWrapperBlackAndWhite');
const RLWrapperTimeouts = require('../lib/RLWrapperTimeouts');
const RateLimiterUnion = require('../lib/RateLimiterUnion');
const RateLimiterCompatibleAbstract = require('../lib/RateLimiterCompatibleAbstract');
const isRateLimiterCompatible = require('../lib/helper/isRateLimiterCompatible');

class TestRateLimiterStoreMemory extends RateLimiterStoreAbstract {
  constructor(opts) {
    super(opts);
    this._inMemoryDataAsStorage = {};
  }

  _getRateLimiterRes(rlKey, changedPoints, storeResult) {
    const res = new RateLimiterRes();
    res.consumedPoints = storeResult.points;
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = storeResult.msBeforeNext;
    return res;
  }

  _get(rlKey) {
    const result = this._inMemoryDataAsStorage[rlKey];
    return Promise.resolve(typeof result === 'undefined' ? null : result);
  }

  _delete(rlKey) {
    const value = this._inMemoryDataAsStorage[rlKey];
    if (typeof value === 'undefined') {
      return Promise.resolve(false);
    }
    delete this._inMemoryDataAsStorage[rlKey];
    return Promise.resolve(true);
  }

  _upsert(rlKey, points, msDuration) {
    const now = Date.now();
    const result = {
      points,
      msBeforeNext: msDuration,
    };

    if (typeof this._inMemoryDataAsStorage[rlKey] === 'undefined') {
      this._inMemoryDataAsStorage[rlKey] = {
        points,
        expired: now + msDuration,
      };
    } else {
      const value = this._inMemoryDataAsStorage[rlKey];
      if (value.expired > now) {
        value.points += points;
        result.points = value.points;
        result.msBeforeNext = value.expired - now;
      } else {
        value.points = points;
        value.expired = now + msDuration;
      }
    }

    return Promise.resolve(result);
  }
}

describe('RateLimiterCompatibleAbstract', () => {
  describe('isRateLimiterCompatible helper', () => {
    it('should return true for RateLimiterAbstract instance', () => {
      const limiter = new RateLimiterMemory({ points: 5, duration: 1 });
      expect(isRateLimiterCompatible(limiter)).to.be.true;
    });

    it('should return true for RateLimiterCompatibleAbstract instance', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      expect(isRateLimiterCompatible(wrapper)).to.be.true;
    });

    it('should return false for plain objects', () => {
      expect(isRateLimiterCompatible({})).to.be.false;
    });

    it('should return false for null', () => {
      expect(isRateLimiterCompatible(null)).to.be.false;
    });

    it('should return false for undefined', () => {
      expect(isRateLimiterCompatible(undefined)).to.be.false;
    });
  });

  describe('RLWrapperBlackAndWhite extends RateLimiterCompatibleAbstract', () => {
    it('should be instance of RateLimiterCompatibleAbstract', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      expect(wrapper instanceof RateLimiterCompatibleAbstract).to.be.true;
    });

    it('should delegate keyPrefix from wrapper to inner limiter', () => {
      const innerLimiter = new RateLimiterMemory({ keyPrefix: 'inner', points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      expect(wrapper.keyPrefix).to.equal('inner');
    });

    it('should delegate blockDuration getter to inner limiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1, blockDuration: 10 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      expect(wrapper.blockDuration).to.equal(10);
    });

    it('should delegate blockDuration setter to inner limiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1, blockDuration: 5 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      wrapper.blockDuration = 20;
      expect(innerLimiter.blockDuration).to.equal(20);
      expect(wrapper.blockDuration).to.equal(20);
    });

    it('should delegate execEvenly getter to inner limiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1, execEvenly: true });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      expect(wrapper.execEvenly).to.equal(true);
    });

    it('should delegate execEvenly setter to inner limiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1, execEvenly: false });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });
      wrapper.execEvenly = true;
      expect(innerLimiter.execEvenly).to.equal(true);
      expect(wrapper.execEvenly).to.equal(true);
    });
  });

  describe('RLWrapperBlackAndWhite as insuranceLimiter', () => {
    it('should accept RLWrapperBlackAndWhite as insuranceLimiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      expect(rateLimiter.insuranceLimiter).to.equal(wrapper);
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res.remainingPoints).to.equal(4);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on penalty store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.penalty('test-key', 2)
        .then((res) => {
          expect(res.consumedPoints).to.equal(2);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on reward store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      innerLimiter.consume('test-key', 3).catch(() => {});
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.reward('test-key', 1)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on get store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      innerLimiter.consume('test-key').catch(() => {});
      rateLimiter._get = () => Promise.reject(new Error('Store error'));

      rateLimiter.get('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on delete store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });

      innerLimiter.consume('test-key').catch(() => {});
      rateLimiter._delete = () => Promise.reject(new Error('Store error'));

      rateLimiter.delete('test-key')
        .then((res) => {
          expect(res).to.equal(true);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on block store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.block('test-key', 5)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should fallback to RLWrapperBlackAndWhite insuranceLimiter on set store error', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter: wrapper,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.set('test-key-set', 3, 30)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          // Verify data was stored in the wrapper's inner limiter with correct points
          wrapper.get('test-key-set')
            .then((wrapperRes) => {
              expect(wrapperRes).to.not.be.null;
              // set() correctly falls back to insuranceLimiter.set() with the passed points
              expect(wrapperRes.consumedPoints).to.equal(3);
              done();
            })
            .catch((err) => done(err));
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should resolve with insuranceLimiter result when store set() fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 5,
        duration: 1,
        insuranceLimiter: insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Redis connection error'));

      rateLimiter.set('test-key', 2, 60)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.consumedPoints).to.equal(2);
          // Verify data was stored in insurance limiter
          insuranceLimiter.get('test-key')
            .then((insuranceRes) => {
              expect(insuranceRes).to.not.be.null;
              expect(insuranceRes.consumedPoints).to.equal(2);
              done();
            })
            .catch((err) => done(err));
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should reject when both store set() and insuranceLimiter set() fail', (done) => {
      const insuranceLimiter = new RateLimiterMemory({ points: 10, duration: 1 });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 5,
        duration: 1,
        insuranceLimiter: insuranceLimiter,
      });
      rateLimiter._upsert = () => Promise.reject(new Error('Redis connection error'));
      // Make insurance limiter's set() also fail
      insuranceLimiter.set = () => Promise.reject(new RateLimiterRes(0, 1000, 10, false));

      rateLimiter.set('test-key', 2, 60)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((rej) => {
          expect(rej).to.be.instanceOf(RateLimiterRes);
          expect(rej.consumedPoints).to.equal(10);
          done();
        });
    });
  });

  describe('RLWrapperBlackAndWhite in RLWrapperTimeouts', () => {
    it('should accept RLWrapperBlackAndWhite as limiter', () => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      expect(wrapper.limiter).to.equal(blackAndWhite);
    });

    it('should consume through RLWrapperBlackAndWhite in RLWrapperTimeouts', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      wrapper.consume('test-key')
        .then((res) => {
          expect(res.remainingPoints).to.equal(4);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should penalty through RLWrapperBlackAndWhite in RLWrapperTimeouts', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      wrapper.penalty('test-key', 2)
        .then((res) => {
          expect(res.consumedPoints).to.equal(2);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should get through RLWrapperBlackAndWhite in RLWrapperTimeouts', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      wrapper.consume('test-key')
        .then(() => {
          return wrapper.get('test-key');
        })
        .then((res) => {
          expect(res.consumedPoints).to.equal(1);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should block through RLWrapperBlackAndWhite in RLWrapperTimeouts', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      wrapper.block('test-key', 5)
        .then((res) => {
          expect(res.msBeforeNext).to.be.greaterThan(1000);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should delete through RLWrapperBlackAndWhite in RLWrapperTimeouts', (done) => {
      const innerLimiter = new RateLimiterMemory({ points: 5, duration: 1 });
      const blackAndWhite = new RLWrapperBlackAndWhite({ limiter: innerLimiter });

      const wrapper = new RLWrapperTimeouts({
        limiter: blackAndWhite,
        timeoutMs: 500,
      });

      wrapper.consume('test-key')
        .then(() => {
          return wrapper.delete('test-key');
        })
        .then((res) => {
          expect(res).to.equal(true);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  describe('RLWrapperBlackAndWhite in RateLimiterUnion', () => {
    it('should accept RLWrapperBlackAndWhite in union', () => {
      const limiter1 = new RateLimiterMemory({ keyPrefix: 'l1', points: 5, duration: 1 });
      const limiter2 = new RateLimiterMemory({ keyPrefix: 'l2', points: 3, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: limiter2 });

      const union = new RateLimiterUnion(limiter1, wrapper);
      expect(union._limiters.length).to.equal(2);
    });

    it('should consume from union with RLWrapperBlackAndWhite', (done) => {
      const limiter1 = new RateLimiterMemory({ keyPrefix: 'l1', points: 5, duration: 1 });
      const limiter2 = new RateLimiterMemory({ keyPrefix: 'l2', points: 3, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: limiter2 });

      const union = new RateLimiterUnion(limiter1, wrapper);
      union.consume('test-key')
        .then((res) => {
          expect(res['l1'].remainingPoints).to.equal(4);
          expect(res['l2'].remainingPoints).to.equal(2);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should reject from union when RLWrapperBlackAndWhite exceeds limit', (done) => {
      const limiter1 = new RateLimiterMemory({ keyPrefix: 'l1', points: 5, duration: 1 });
      const limiter2 = new RateLimiterMemory({ keyPrefix: 'l2', points: 1, duration: 1 });
      const wrapper = new RLWrapperBlackAndWhite({ limiter: limiter2 });

      const union = new RateLimiterUnion(limiter1, wrapper);
      union.consume('test-key', 2)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((rej) => {
          expect(rej['l2'].remainingPoints).to.equal(0);
          done();
        });
    });
  });
});
