/* eslint-disable new-cap */
/* eslint-disable no-unused-expressions */
const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const RateLimiterRedisNonAtomic = require('../lib/RateLimiterRedisNonAtomic');
const Redis = require('ioredis');

describe('RateLimiterRedisNonAtomic with fixed window', function RateLimiterRedisNonAtomicTest() {
  this.timeout(5500);
  let redisMockClient;

  beforeEach(async () => {
    redisMockClient = new Redis({
      port: 6379,
      host: '127.0.0.1',
    });
  });

  afterEach(async () => {
    await redisMockClient.flushdb();
    await redisMockClient.disconnect();
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 2,
      duration: 5,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        redisMockClient.get(rateLimiter.getKey(testKey)).then((consumedPoints) => {
          expect(consumedPoints).to.equal('1');
          done();
        });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('rejected when consume more than maximum points', (done) => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 1,
      duration: 5,
    });
    rateLimiter
      .consume(testKey, 2)
      .then(() => {})
      .catch((rejRes) => {
        expect(rejRes.msBeforeNext >= 0).to.equal(true);
        done();
      });
  });

  it('does not allow to consume when duration is negative', (done) => {
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 2,
      duration: -1,
    });
    rateLimiter.consume('consumewhennegative', 1)
      .then(() => done(new Error('should reject')))
      .catch(() => done());
  });

  it('sets expire when existing key has no ttl', (done) => {
    const testKey = 'no-ttl';
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 2,
      duration: 1,
    });
    const rlKey = rateLimiter.getKey(testKey);
    redisMockClient
      .set(rlKey, '1')
      .then(() => rateLimiter.consume(testKey))
      .then(() => redisMockClient.pttl(rlKey))
      .then((ttl) => {
        expect(ttl > 0).to.equal(true);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('get returns NULL if key is not set', (done) => {
    const testKey = 'getnull';
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 2,
      duration: 1,
    });
    rateLimiter
      .get(testKey)
      .then((res) => {
        expect(res).to.equal(null);
        done();
      })
      .catch(() => {
        done(Error('get must not reject'));
      });
  });

  it('set points by key forever', (done) => {
    const testKey = 'setforever';
    const rateLimiter = new RateLimiterRedisNonAtomic({
      storeClient: redisMockClient,
      points: 1,
      duration: 1,
    });
    rateLimiter.set(testKey, 12, 0)
      .then(() => {
        setTimeout(() => {
          rateLimiter.get(testKey)
            .then((res) => {
              expect(res.consumedPoints).to.equal(12);
              expect(res.msBeforeNext).to.equal(-1);
              done();
            });
        }, 1100);
      })
      .catch((err) => {
        done(err);
      });
  });
});
