/* eslint-disable no-unused-expressions */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const BurstyRateLimiter = require('../lib/BurstyRateLimiter');
const RateLimiterRedis = require('../lib/RateLimiterRedis');
const Redis = require("ioredis");

describe('BurstyRateLimiter', () => {
  it('consume 1 point from limiter', (done) => {
    const testKey = 'consume1';
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const bursty = new BurstyRateLimiter(rlMemory, blMemory);
    bursty.consume(testKey)
      .then((res) => {
        expect(res.consumedPoints).to.equal(1);
        expect(res.remainingPoints).to.equal(0);
        expect(res.msBeforeNext <= 1000).to.equal(true);
        expect(res.isFirstInDuration).to.equal(true);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('consume 1 point from bursty limiter, if all consumed on limiter', (done) => {
    const testKey = 'consume1frombursty';
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const bursty = new BurstyRateLimiter(rlMemory, blMemory);
    bursty.consume(testKey)
      .then(() => {
        bursty.consume(testKey)
          .then((res) => {
            expect(res.consumedPoints).to.equal(2);
            expect(res.remainingPoints).to.equal(0);
            expect(res.msBeforeNext <= 1000).to.equal(true);
            expect(res.isFirstInDuration).to.equal(false);
            done();
          })
          .catch((err) => {
            done(err);
          });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('consume 1 point from limiter and 1 from bursty, and then 1 point reject with data from limiter', (done) => {
    const testKey = 'consume1frombursty';
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const bursty = new BurstyRateLimiter(rlMemory, blMemory);
    bursty.consume(testKey)
      .then(() => {
        bursty.consume(testKey)
          .then(() => {
            bursty.consume(testKey)
              .then(() => {
                done(new Error('must not'));
              })
              .catch((rej) => {
                expect(rej.consumedPoints).to.equal(3);
                expect(rej.remainingPoints).to.equal(0);
                expect(rej.msBeforeNext <= 1000).to.equal(true);
                expect(rej.isFirstInDuration).to.equal(false);
                done();
              });
          })
          .catch((err) => {
            done(err);
          });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('do not consume from burst limiter, if rate limiter consume rejected with error', async() => {
    const testKey = 'consume-rejected-with-error';
    const redisMockClient = new Redis();
    const redisClientClosed = new Redis();
    await redisClientClosed.disconnect();
    const rlRedisClosed = new RateLimiterRedis({
      storeClient: redisClientClosed,
    });
    const blRedis = new RateLimiterRedis({
      storeClient: redisMockClient,
      keyPrefix: 'bursty',
      points: 1,
      duration: 1,
    });
    const bursty = new BurstyRateLimiter(rlRedisClosed, blRedis);

    let testFailed = false
    try {
      await bursty.consume(testKey)
      testFailed = true;
    } catch(err) {
      expect(err instanceof Error).to.equal(true);
      try {
        const rlRes = await rlRedis.get(testKey)
        expect(rlRes).to.equal(null);
      } catch (err2) {
        testFailed = true;
      }
    }
    await redisMockClient.disconnect();
    if (testFailed) {
      return new Error('must not');
    }
  });

  it('reject with burst limiter error if it happens', async() => {
    const testKey = 'consume-rejected-with-error';
    const redisMockClient = new Redis();
    const redisClientClosed = new Redis();
    await redisClientClosed.disconnect();
    const rlRedis = new RateLimiterRedis({
      storeClient: redisMockClient,
      points: 1,
      duration: 1,
    });
    const blRedisClosed = new RateLimiterRedis({
      storeClient: redisClientClosed,
      keyPrefix: 'bursty',
    });
    const bursty = new BurstyRateLimiter(rlRedis, blRedisClosed);
    await bursty.consume(testKey);
    let testFailed = false
    try {
      await bursty.consume(testKey)
      testFailed = true;
    } catch(err) {
      expect(err instanceof Error).to.equal(true);
      const rlRes = await rlRedis.get(testKey)
      expect(rlRes.consumedPoints).to.equal(2);
      expect(rlRes.remainingPoints).to.equal(0);
      expect(rlRes.msBeforeNext <= 1000).to.equal(true);
    }
    await redisMockClient.disconnect();
    if (testFailed) {
      throw new Error('must not');
    }
  });

  it('consume and get return the combined RateLimiterRes of both limiters with correct msBeforeNext', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const rlBurstMemory = new RateLimiterMemory({ points: 20, duration: 1 });

    const bl = new BurstyRateLimiter(rlMemory, rlBurstMemory);

    bl.consume('keyGet', 1)
      .then((firstConsumeRes) => {
        expect(firstConsumeRes.isFirstInDuration).to.equal(true);
        bl.consume('keyGet', 1)
          .then((res) => {
            expect(res.consumedPoints).to.equal(2);
            expect(res.remainingPoints).to.equal(0);
            expect(res.msBeforeNext <= 1000).to.equal(true);
            expect(res.isFirstInDuration).to.equal(false);

            bl.get('keyGet')
              .then((rlRes) => {
                expect(rlRes.consumedPoints).to.equal(2);
                expect(rlRes.remainingPoints).to.equal(0);
                expect(rlRes.msBeforeNext <= 1000).to.equal(true);
                done();
              })
              .catch(err => done(err));
          })
          .catch((err) => {
            done(err);
          });
      });
  });

  it('returns points from limiter', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const rlBurstMemory = new RateLimiterMemory({ points: 20, duration: 1 });

    const brl = new BurstyRateLimiter(rlMemory, rlBurstMemory);
    expect(brl.points).to.equal(1);
    done();
  });

  it('returns null if key does not exist', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const rlBurstMemory = new RateLimiterMemory({ points: 20, duration: 1 });

    const brl = new BurstyRateLimiter(rlMemory, rlBurstMemory);
    brl.get('test-null')
      .then((res) => {
        expect(res).to.equal(null);
        done();
      });
  });

  it('returns msBeforeNext=0 if key is not set on bursty limiter', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const rlBurstMemory = new RateLimiterMemory({ points: 20, duration: 1 });

    const testKey = 'test-burst-null'
    const brl = new BurstyRateLimiter(rlMemory, rlBurstMemory);
    rlMemory.consume(testKey)
      .then(async () => {
        brl.get(testKey)
          .then((res) => {
            expect(res.msBeforeNext).to.equal(0);
            done();
          })
          .catch((err) => {
            done(err);
          })
      })
      .catch((err) => {
        done(err);
      });
  });
});
