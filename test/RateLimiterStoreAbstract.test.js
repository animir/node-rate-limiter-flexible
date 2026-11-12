/* eslint-disable security/detect-object-injection */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterStoreAbstract = require('../lib/RateLimiterStoreAbstract');
const RateLimiterRes = require('../lib/RateLimiterRes');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

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

// Same store, but honors forceExpire (used by _block) and counts how many blocks were set
class RateLimiterStoreMemoryWithBlock extends RateLimiterStoreMemory {
  constructor(opts) {
    super(opts);
    this.blockCalls = 0;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (forceExpire) {
      this.blockCalls += 1;
      this._inMemoryDataAsStorage[rlKey] = {
        points,
        expired: Date.now() + msDuration,
      };
      return Promise.resolve({ points, msBeforeNext: msDuration });
    }

    return super._upsert(rlKey, points, msDuration);
  }
}

async function tryConsume(limiter, key, points = 1) {
  try {
    return { ok: true, res: await limiter.consume(key, points) };
  } catch (res) {
    return { ok: false, res };
  }
}

async function consumeTimes(limiter, key, times) {
  const results = [];
  for (let i = 0; i < times; i++) {
    results.push(await tryConsume(limiter, key)); // eslint-disable-line no-await-in-loop
  }
  return results;
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
        expect(rateLimiter._inMemoryBlockedKeys._keys.has('key1')).eq(true);
        expect(rateLimiter._inMemoryBlockedKeys._keys.has('key2')).eq(true);

        rateLimiter.deleteInMemoryBlockedAll();
        expect(rateLimiter._inMemoryBlockedKeys._keys.has('key1')).eq(false);
        expect(rateLimiter._inMemoryBlockedKeys._keys.has('key2')).eq(false);

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
      expect(rateLimiter._inMemoryBlockedKeys._keys.has('key')).eq(true);

      rateLimiter.delete('key').then((isExist) => {
        expect(rateLimiter._inMemoryBlockedKeys._keys.has('key')).eq(false);
        expect(isExist).eq(true);

        done();
      });
    });
  });
});

describe('RateLimiterStoreAbstract blockOnConsumed', () => {
  const opts = {
    points: 10,
    duration: 10,
    blockDuration: 60,
    blockOnConsumed: 15,
    keyPrefix: '',
  };

  it('resolves requests up to points', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock(opts);
    const results = await consumeTimes(limiter, 'k', 10);

    expect(results.every(r => r.ok)).eq(true);
    expect(limiter.blockCalls).eq(0);
  });

  it('rejects between points and blockOnConsumed without blocking, counter keeps growing', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock(opts);
    const results = await consumeTimes(limiter, 'k', 14);
    const rejected = results.slice(10);

    expect(rejected.length).eq(4);
    rejected.forEach((r) => {
      expect(r.ok).eq(false);
      expect(r.res.msBeforeNext).to.be.at.most(10000);
    });
    expect(limiter.blockCalls).eq(0);
    expect(limiter._inMemoryDataAsStorage.k.points).eq(14);
  });

  it('blocks for blockDuration when consumed reaches blockOnConsumed', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock(opts);
    const results = await consumeTimes(limiter, 'k', 15);

    expect(results[14].ok).eq(false);
    expect(results[14].res.msBeforeNext).eq(60000);
    expect(limiter.blockCalls).eq(1);
    expect(limiter._inMemoryDataAsStorage.k.points).eq(15);
  });

  it('does not block again or extend the block after the threshold', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock(opts);
    await consumeTimes(limiter, 'k', 15);
    const expiredBefore = limiter._inMemoryDataAsStorage.k.expired;
    const results = await consumeTimes(limiter, 'k', 3);

    results.forEach(r => expect(r.ok).eq(false));
    expect(limiter.blockCalls).eq(1);
    expect(limiter._inMemoryDataAsStorage.k.expired).eq(expiredBefore);
  });

  it('blocks as soon as points are exceeded when blockOnConsumed is not set', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: 10,
      duration: 10,
      blockDuration: 60,
      keyPrefix: '',
    });
    const results = await consumeTimes(limiter, 'k', 11);

    expect(results[10].ok).eq(false);
    expect(results[10].res.msBeforeNext).eq(60000);
    expect(limiter.blockCalls).eq(1);
  });

  it('throws if blockOnConsumed is less than points', () => {
    expect(() => new RateLimiterStoreMemoryWithBlock({
      points: 10,
      duration: 10,
      blockDuration: 60,
      blockOnConsumed: 5,
    })).to.throw('blockOnConsumed option must be greater or equal "points" option');
  });

  it('manual block() stores the threshold, so later consumes do not re-block', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock(opts);
    await limiter.block('k', 120);
    const expiredBefore = limiter._inMemoryDataAsStorage.k.expired;

    expect(limiter._inMemoryDataAsStorage.k.points).eq(15);

    const results = await consumeTimes(limiter, 'k', 4);

    results.forEach(r => expect(r.ok).eq(false));
    expect(limiter.blockCalls).eq(1);
    expect(limiter._inMemoryDataAsStorage.k.expired).eq(expiredBefore);
  });

  it('keeps the original crossing condition for fractional points', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: 1.5,
      duration: 10,
      blockDuration: 60,
      keyPrefix: '',
    });
    const results = await consumeTimes(limiter, 'k', 2);

    expect(results[0].ok).eq(true);
    expect(results[1].ok).eq(false);
    expect(results[1].res.msBeforeNext).eq(60000);
    expect(limiter.blockCalls).eq(1);
  });

  it('is a store limiter option only, RateLimiterMemory does not have it', () => {
    const memory = new RateLimiterMemory({
      points: 10,
      duration: 10,
      blockOnConsumed: 15,
    });

    expect(memory.blockOnConsumed).eq(undefined);
    expect(new RateLimiterStoreMemoryWithBlock(opts).blockOnConsumed).eq(15);
  });

  it('behaves as the default when blockOnConsumed equals points', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: 10,
      duration: 10,
      blockDuration: 60,
      blockOnConsumed: 10,
      keyPrefix: '',
    });
    const results = await consumeTimes(limiter, 'k', 11);

    expect(results[9].ok).eq(true);
    expect(limiter.blockCalls).eq(1);
    expect(results[10].ok).eq(false);
    expect(results[10].res.msBeforeNext).eq(60000);
  });

  it('blocks at the configured threshold for fractional points', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: 1.5,
      duration: 10,
      blockDuration: 60,
      blockOnConsumed: 2,
      keyPrefix: '',
    });
    const results = await consumeTimes(limiter, 'k', 2);

    expect(results[0].ok).eq(true);
    expect(results[1].ok).eq(false);
    expect(results[1].res.msBeforeNext).eq(60000);
    expect(limiter.blockCalls).eq(1);
  });

  it('manual block() stores points + 1 for negative points when blockOnConsumed is not set', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: -5,
      duration: 10,
      blockDuration: 60,
      keyPrefix: '',
    });
    await limiter.block('k', 120);

    expect(limiter._inMemoryDataAsStorage.k.points).eq(-4);
  });

  it('keeps the original crossing condition for negative points when blockOnConsumed is not set', async () => {
    const limiter = new RateLimiterStoreMemoryWithBlock({
      points: -5,
      duration: 10,
      blockDuration: 60,
      keyPrefix: '',
    });
    await limiter.reward('k', 10);
    const result = await tryConsume(limiter, 'k', 6);

    expect(result.ok).eq(false);
    expect(result.res.msBeforeNext).eq(60000);
    expect(limiter.blockCalls).eq(1);
  });

  it('_getSecDuration rounds durations under 1 second up to 1 and floors the rest', () => {
    const limiter = new RateLimiterStoreMemory({ points: 1, duration: 1 });
    expect([0, 1, 500, 999, 1000, 1500, 1999, 2000].map(ms => limiter._getSecDuration(ms)))
      .to.deep.equal([0, 1, 1, 1, 1, 1, 1, 2]);
  });
});
