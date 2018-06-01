const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const RateLimiterRedis = require('../lib/RateLimiterRedis');
const redisMock = require('redis-mock');

describe('RateLimiterRedis with fixed window', function () {
  this.timeout(5000);
  const redisMockClient = redisMock.createClient();

  // emulate closed RedisClient
  class RedisClient {
    multi() {
      const multi = redisMockClient.multi();
      multi.exec = (cb) => {
        cb(new Error('closed'), []);
      };

      return multi;
    }
  }

  const redisClientClosedRaw = new RedisClient();

  const redisClientClosed = new Proxy(redisClientClosedRaw, {
    get: (func, name) => {
      if (name in redisClientClosedRaw) {
        return redisClientClosedRaw[name];
      }
      return function (...args) {
        const cb = args.pop();
        cb(Error('closed'));
      };
    },
  });

  beforeEach((done) => {
    redisMockClient.flushall(done);
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterRedis({ redis: redisMockClient, points: 2, duration: 5 });
    rateLimiter.consume(testKey)
      .then(() => {
        redisMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('1');
            done();
          }
        });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('rejected when consume more than maximum points', (done) => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterRedis({ redis: redisMockClient, points: 1, duration: 5 });
    rateLimiter.consume(testKey, 2)
      .then(() => {})
      .catch((rejRes) => {
        expect(rejRes.msBeforeNext >= 0).to.equal(true);
        done();
      });
  });

  it('consume evenly over duration', (done) => {
    const testKey = 'consumeEvenly';
    const rateLimiter = new RateLimiterRedis({
      redis: redisMockClient, points: 2, duration: 5, execEvenly: true,
    });
    rateLimiter.consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiter.consume(testKey)
          .then(() => {
            /* Second consume should be delayed more than 2 seconds
               Explanation:
               1) consume at 0ms, remaining duration = 4444ms
               2) delayed consume for (4444 / (0 + 2)) ~= 2222ms, where 2 is a fixed value
                , because it mustn't delay in the beginning and in the end of duration
               3) consume after 2222ms by timeout
            */
            expect(Date.now() - timeFirstConsume > 2000).to.equal(true);
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

  it('makes penalty', (done) => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiterRedis({ redis: redisMockClient, points: 3, duration: 5 });
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.penalty(testKey)
          .then(() => {
            redisMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal('2');
                done();
              }
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

  it('reward points', (done) => {
    const testKey = 'reward';
    const rateLimiter = new RateLimiterRedis({ redis: redisMockClient, points: 1, duration: 5 });
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.reward(testKey)
          .then(() => {
            redisMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal('0');
                done();
              }
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

  it('block key when block options set up', (done) => {
    const testKey = 'block';
    const rateLimiter = new RateLimiterRedis({
      redis: redisMockClient,
      points: 1,
      duration: 5,
      blockOnPointsConsumed: 2,
      blockDuration: 10,
    });
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.consume(testKey)
          .then(() => {
          })
          .catch((rejRes) => {
            // msBeforeNext more than 5000, so key was blocked
            expect(rejRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.equal(true);
            done();
          });
      })
      .catch((rejRes) => {
        done(rejRes);
      });
  });

  it('expire blocked key', (done) => {
    const testKey = 'block';
    const rateLimiter = new RateLimiterRedis({
      redis: redisMockClient,
      points: 1,
      duration: 1,
      blockOnPointsConsumed: 2,
      blockDuration: 2,
    });
    // It blocks on the first consume as consumed points more than available
    rateLimiter.consume(testKey, 2)
      .then(() => {

      })
      .catch(() => {
        setTimeout(() => {
          rateLimiter.consume(testKey)
            .then((res) => {
              // Block expired
              expect(res.msBeforeNext <= 1000 && res.remainingPoints === 0).to.equal(true);
              done();
            })
            .catch((rejRes) => {
              done(rejRes);
            });
        }, 2001);
      });
  });

  it('throws error when blockOnPointsConsumed is not set, but blockDuration is set', (done) => {
    try {
      const rateLimiter = new RateLimiterRedis({
        redis: redisMockClient,
        blockDuration: 2,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('throws error when blockOnPointsConsumed less or equal to points', (done) => {
    try {
      const rateLimiter = new RateLimiterRedis({
        redis: redisMockClient,
        points: 2,
        blockOnPointsConsumed: 2,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('throws error on RedisClient error', (done) => {
    const testKey = 'rediserror';

    const rateLimiter = new RateLimiterRedis({
      redis: redisClientClosed,
    });

    rateLimiter.consume(testKey)
      .then(() => {

      })
      .catch((rejRes) => {
        expect(rejRes instanceof Error).to.equal(true);
        done();
      });
  });

  it('consume using insuranceLimiter when RedisClient error', (done) => {
    const testKey = 'rediserror2';

    const rateLimiter = new RateLimiterRedis({
      redis: redisClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterRedis({
        points: 2,
        duration: 2,
        redis: redisMockClient,
      }),
    });

    // Consume from insurance limiter with different options
    rateLimiter.consume(testKey)
      .then((res) => {
        expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.equal(true);
        done();
      })
      .catch((rejRes) => { done(rejRes); });
  });

  it('penalty using insuranceLimiter when RedisClient error', (done) => {
    const testKey = 'rediserror3';

    const rateLimiter = new RateLimiterRedis({
      redis: redisClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterRedis({
        points: 2,
        duration: 2,
        redis: redisMockClient,
      }),
    });

    rateLimiter.penalty(testKey)
      .then(() => {
        redisMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('1');
            done();
          }
        });
      })
      .catch((rejRes) => { done(rejRes); });
  });

  it('reward using insuranceLimiter when RedisClient error', (done) => {
    const testKey = 'rediserror4';

    const rateLimiter = new RateLimiterRedis({
      redis: redisClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterRedis({
        points: 2,
        duration: 2,
        redis: redisMockClient,
      }),
    });

    rateLimiter.consume(testKey, 2)
      .then(() => {
        rateLimiter.reward(testKey)
          .then(() => {
            redisMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal('1');
                done();
              }
            });
          })
          .catch((rejRes) => { done(rejRes); });
      })
      .catch((rejRes) => { done(rejRes); });
  });

  it('use keyPrefix from options', () => {
    const testKey = 'key';
    const keyPrefix = 'test';
    const rateLimiter = new RateLimiterRedis({ keyPrefix, redis: redisClientClosed });

    expect(rateLimiter.getKey(testKey)).to.equal('test:key');
  });
});
