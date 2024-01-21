import mocha from "mocha";
import { expect } from "chai";
import RateLimiterStoreAbstract from "../lib/RateLimiterStoreAbstract.js";
import RateLimiterRes from "../lib/RateLimiterRes.js";
/* eslint-disable security/detect-object-injection */
const { describe, it } = mocha;

class RateLimiterStoreMemory extends RateLimiterStoreAbstract {
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

describe('RateLimiterStoreAbstract with fixed window', () => {
  it('delete all in memory blocked keys', (done) => {
    const rateLimiter = new RateLimiterStoreMemory({
      points: 1,
      duration: 1,
      // avoid fire block method
      blockDuration: 0,
      inMemoryBlockOnConsumed: 1,
      inMemoryBlockDuration: 1,
      keyPrefix: '',
    });

    // should start blocking
    Promise.allSettled([
      rateLimiter.consume('key1', 2),
      rateLimiter.consume('key2', 2),
    ])
      .then(() => {
        expect(rateLimiter._inMemoryBlockedKeys._keys.key1).not.eq(undefined);
        expect(rateLimiter._inMemoryBlockedKeys._keys.key2).not.eq(undefined);

        rateLimiter.deleteInMemoryBlockedAll();
        expect(rateLimiter._inMemoryBlockedKeys._keys.key1).eq(undefined);
        expect(rateLimiter._inMemoryBlockedKeys._keys.key2).eq(undefined);

        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('delete specific key should also deleting in-memory data', (done) => {
    const rateLimiter = new RateLimiterStoreMemory({
      points: 1,
      duration: 1,
      // avoid fire block method
      blockDuration: 0,
      inMemoryBlockOnConsumed: 1,
      inMemoryBlockDuration: 1,
      keyPrefix: '',
    });

    // should start blocking
    rateLimiter.consume('key', 2).catch(() => {
      expect(rateLimiter._inMemoryBlockedKeys._keys.key).not.eq(undefined);

      rateLimiter.delete('key').then((isExist) => {
        expect(rateLimiter._inMemoryBlockedKeys._keys.key).eq(undefined);
        expect(isExist).eq(true);

        done();
      });
    });
  });
});
