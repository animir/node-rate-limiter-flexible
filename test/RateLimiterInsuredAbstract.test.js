/* eslint-disable security/detect-object-injection */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterStoreAbstract = require('../lib/RateLimiterStoreAbstract');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const RateLimiterRes = require('../lib/RateLimiterRes');

// Test implementation of RateLimiterStoreAbstract
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

describe('RateLimiterInsuredAbstract - Backward Compatibility Tests', () => {
  describe('Without insuranceLimiter', () => {
    it('consume should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      // Simulate error by making _upsert throw
      const originalUpsert = rateLimiter._upsert;
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('penalty should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      const originalUpsert = rateLimiter._upsert;
      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.penalty('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('reward should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.reward('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('get should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._get = () => Promise.reject(new Error('Store error'));

      rateLimiter.get('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('delete should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._delete = () => Promise.reject(new Error('Store error'));

      rateLimiter.delete('test-key')
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('block should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.block('test-key', 5)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });

    it('set should reject with error when store fails', (done) => {
      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.set('test-key', 5, 10)
        .then(() => {
          done(new Error('Should have rejected'));
        })
        .catch((err) => {
          expect(err).to.be.instanceOf(Error);
          expect(err.message).to.equal('Store error');
          done();
        });
    });
  });

  describe('With insuranceLimiter', () => {
    it('consume should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.remainingPoints).to.equal(4);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should not use insuranceLimiter when rate limit is reached', (done) => {
      const insuranceLimiter = new RateLimiterAbstract();

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      const rateLimiterRes = new RateLimiterRes(6, 0, 5000, false);

      rateLimiter._upsert = () => Promise.reject(rateLimiterRes);

      rateLimiter.consume('test-key').then(() => {
        done(new Error('Should have rejected'));
      }).catch((err) => {
        expect(err).to.equal(rateLimiterRes);
        done();
      });

    });

    it('penalty should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.penalty('test-key', 2)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.consumedPoints).to.equal(2);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('reward should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some points
      insuranceLimiter.consume('test-key', 3)
        .catch(() => {});

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

    it('get should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some data
      insuranceLimiter.consume('test-key')
        .catch(() => {});

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

    it('delete should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // First consume to have some data
      insuranceLimiter.consume('test-key')
        .catch(() => {});

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

    it('block should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
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

    it('set should fallback to insuranceLimiter when store fails', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter._upsert = () => Promise.reject(new Error('Store error'));

      rateLimiter.set('test-key', 5, 10)
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('should work normally when store succeeds (no fallback needed)', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      rateLimiter.consume('test-key')
        .then((res) => {
          expect(res).to.be.instanceOf(RateLimiterRes);
          expect(res.remainingPoints).to.equal(1);
          expect(res.consumedPoints).to.equal(1);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });

    it('insuranceLimiter should inherit blockDuration and execEvenly', () => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 5,
        duration: 2,
        blockDuration: 0,
        execEvenly: false,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        blockDuration: 10,
        execEvenly: true,
        insuranceLimiter,
      });

      expect(insuranceLimiter.blockDuration).to.equal(10);
      expect(insuranceLimiter.execEvenly).to.equal(true);
    });

    it('consume should NOT use insuranceLimiter when rate limit is exceeded (not enough points)', (done) => {
      const insuranceLimiter = new RateLimiterMemory({
        points: 10,
        duration: 2,
      });

      const rateLimiter = new TestRateLimiterStoreMemory({
        points: 2,
        duration: 1,
        insuranceLimiter,
      });

      // Track if insuranceLimiter.consume is called
      let insuranceConsumeCalled = false;
      const originalConsume = insuranceLimiter.consume;
      insuranceLimiter.consume = function(...args) {
        insuranceConsumeCalled = true;
        return originalConsume.apply(this, args);
      };

      // First consume to use up all points (points: 2, so consume 2 points)
      rateLimiter.consume('test-key', 2)
        .then(() => {
          // Second consume should exceed rate limit (now at 2 points, trying to consume 1 more = 3 > 2)
          return rateLimiter.consume('test-key');
        })
        .then(() => {
          done(new Error('Should have rejected when rate limit exceeded'));
        })
        .catch((err) => {
          // Should reject with RateLimiterRes (rate limit exceeded)
          expect(err).to.be.instanceOf(RateLimiterRes);
          expect(err.consumedPoints).to.be.greaterThan(rateLimiter.points);
          // Insurance limiter should NOT be called for rate limit exceeded
          expect(insuranceConsumeCalled).to.equal(false);
          done();
        });
    });
  });
});

