/* eslint-disable no-unused-expressions */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const BurstyRateLimiter = require('../lib/BurstyRateLimiter');
const RateLimiterRedis = require('../lib/RateLimiterRedis');
const redisMock = require('redis-mock');
const { redisEvalMock, getRedisClientClosed } = require('./helper');

describe('BurstyRateLimiter', () => {
  it('consume 1 point from limiter', (done) => {
    const testKey = 'consume1';
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 10 });
    const bursty = new BurstyRateLimiter(rlMemory, blMemory);
    bursty.consume(testKey)
      .then((res) => {
        expect(res.consumedPoints).to.equal(1);
        expect(res.remainingPoints).to.equal(1);
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
            expect(res.consumedPoints).to.equal(3);
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
                expect(rej.consumedPoints).to.equal(5);
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

  it('do not consume from burst limiter, if rate limiter consume rejected with error', (done) => {
    const testKey = 'consume-rejected-with-error';
    const redisMockClient = redisMock.createClient();
    redisMockClient.eval = redisEvalMock(redisMockClient);
    const redisClientClosed = getRedisClientClosed(redisMockClient);
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
    bursty.consume(testKey)
      .then(() => {
        done(new Error('must not'));
      })
      .catch((err) => {
        expect(err instanceof Error).to.equal(true);
        blRedis.get(testKey)
          .then((res) => {
            expect(res).to.equal(null);
            done();
          });
      });
  });

  it('reject with burst limiter error if it happens', (done) => {
    const testKey = 'consume-rejected-with-error';
    const redisMockClient = redisMock.createClient();
    redisMockClient.eval = redisEvalMock(redisMockClient);
    const redisClientClosed = getRedisClientClosed(redisMockClient);
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
    bursty
      .consume(testKey)
      .then(() => {
        done(new Error('must not'));
      })
      .catch((err) => {
        expect(err instanceof Error).to.equal(true);
        rlRedis.get(testKey).then((rlRes) => {
          expect(rlRes.consumedPoints).to.equal(1);
          expect(rlRes.remainingPoints).to.equal(0);
          expect(rlRes.msBeforeNext <= 1000).to.equal(true);
          done();
        })
        .catch(err => done(err));
      })
  });

  it('get returns the combined RateLimiterRes of both limiters', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 10, duration: 1 });
    const rlBurstMemory = new RateLimiterMemory({ points: 20, duration: 1 });

    const bl = new BurstyRateLimiter(rlMemory, rlBurstMemory);

    bl.consume('keyA', 5)
    .then((res) => {
      expect(res.consumedPoints).to.equal(5);
      expect(res.remainingPoints).to.equal(25);
      expect(res.msBeforeNext <= 1000).to.equal(true);
      expect(res.isFirstInDuration).to.equal(true);
      done();
    })
    .catch((err) => {
      done(err);
    });
  })
});
