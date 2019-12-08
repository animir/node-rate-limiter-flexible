const {describe, it, beforeEach} = require('mocha');
const {expect} = require('chai');
const RateLimiterMemcache = require('../lib/RateLimiterMemcache');
const Memcached = require('memcached-mock');

describe('RateLimiterMemcache', function RateLimiterMemcacheTest() {
  this.timeout(5000);
  const memcacheMockClient = new Memcached('localhost:11211');

  const memcacheUnavailableClient = new Proxy({}, {
    get: () => (...args) => {
      const cb = args.pop();
      cb(Error('Server Unavailable'));
    },
  });

  beforeEach((done) => {
    memcacheMockClient.flush(done);
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 5,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        memcacheMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal(1);
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
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 5,
    });
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
      })
      .catch((rejRes) => {
        expect(rejRes.msBeforeNext >= 0).to.equal(true);
        done();
      });
  });

  it('execute evenly over duration', (done) => {
    const testKey = 'consumeEvenly';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 5,
      execEvenly: true,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiter
          .consume(testKey)
          .then(() => {
            /* Second consume should be delayed more than 2 seconds
               Explanation:
               1) consume at 0ms, remaining duration = 5000ms
               2) delayed consume for (4999 / (0 + 2)) ~= 2500ms, where 2 is a fixed value
                , because it mustn't delay in the beginning and in the end of duration
               3) consume after 2500ms by timeout
            */
            const diff = Date.now() - timeFirstConsume;
            expect(diff > 2400 && diff < 2600).to.equal(true);
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

  it('execute evenly over duration with minimum delay 20 ms', (done) => {
    const testKey = 'consumeEvenlyMinDelay';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 100,
      duration: 1,
      execEvenly: true,
      execEvenlyMinDelayMs: 20,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiter
          .consume(testKey)
          .then(() => {
            expect(Date.now() - timeFirstConsume >= 20).to.equal(true);
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
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 3,
      duration: 5,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .penalty(testKey)
          .then(() => {
            memcacheMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal(2);
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
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 5,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .reward(testKey)
          .then(() => {
            memcacheMockClient.get(rateLimiter.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal(0);
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

  it('block key in memory when inmemory block options set up', (done) => {
    const testKey = 'blockmem';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 5,
      inmemoryBlockOnConsumed: 2,
      inmemoryBlockDuration: 10,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .consume(testKey)
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

  it('expire inmemory blocked key', (done) => {
    const testKey = 'blockmem2';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 1,
      inmemoryBlockOnConsumed: 2,
      inmemoryBlockDuration: 2,
    });
    // It blocks on the first consume as consumed points more than available
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
      })
      .catch(() => {
        setTimeout(() => {
          rateLimiter
            .consume(testKey)
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

  it('throws error when inmemoryBlockOnConsumed is not set, but inmemoryBlockDuration is set', (done) => {
    try {
      const rateLimiter = new RateLimiterMemcache({
        storeClient: memcacheMockClient,
        inmemoryBlockDuration: 2,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('throws error when inmemoryBlockOnConsumed less than points', (done) => {
    try {
      const rateLimiter = new RateLimiterMemcache({
        storeClient: memcacheMockClient,
        points: 2,
        inmemoryBlockOnConsumed: 1,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('use keyPrefix from options', () => {
    const testKey = 'key';
    const keyPrefix = 'test';
    const rateLimiter = new RateLimiterMemcache({keyPrefix, storeClient: memcacheMockClient});

    expect(rateLimiter.getKey(testKey)).to.equal('test:key');
  });

  it('blocks key for block duration when consumed more than points', (done) => {
    const testKey = 'block';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 1,
      blockDuration: 2,
    });
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej.msBeforeNext > 1000).to.equal(true);
        done();
      });
  });

  it('block expires in blockDuration seconds', (done) => {
    const testKey = 'blockexpires';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 1,
      blockDuration: 2,
    });
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch(() => {
        setTimeout(() => {
          rateLimiter
            .consume(testKey)
            .then((res) => {
              expect(res.consumedPoints).to.equal(1);
              done();
            })
            .catch(() => {
              done(Error('must resolve'));
            });
        }, 2000);
      });
  });

  it('block custom key', (done) => {
    const testKey = 'blockcustom';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 1,
      duration: 1,
    });
    rateLimiter.block(testKey, 2).then(() => {
      rateLimiter
        .consume(testKey)
        .then(() => {
          done(Error('must not resolve'));
        })
        .catch((rej) => {
          expect(rej.msBeforeNext > 1000 && rej.msBeforeNext <= 2000).to.equal(true);
          done();
        });
    });
  });

  it('get points', (done) => {
    const testKey = 'get';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 1,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .get(testKey)
          .then((res) => {
            expect(res.consumedPoints).to.equal(1);
            done();
          })
          .catch(() => {
            done(Error('get must not reject'));
          });
      })
      .catch(() => {
        done(Error('consume must not reject'));
      });
  });

  it('get returns NULL if key is not set', (done) => {
    const testKey = 'getnull';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
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

  it('delete key and return true', (done) => {
    const testKey = 'deletetrue';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 10,
    });
    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .delete(testKey)
          .then((res) => {
            expect(res).to.equal(true);
            rateLimiter
              .get(testKey)
              .then((resGet) => {
                expect(resGet).to.equal(null);
                done();
              });
          });
      });
  });

  it('delete returns false, if there is no key', (done) => {
    const testKey = 'deletefalse';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 10,
    });
    rateLimiter
      .delete(testKey)
      .then((res) => {
        expect(res).to.equal(false);
        rateLimiter
          .get(testKey)
          .then((resGet) => {
            expect(resGet).to.equal(null);
            done();
          });
      });
  });

  it('creates key and increment on 2 parallel requests', () => {
    const testKey = 'parallel';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheMockClient,
      points: 2,
      duration: 1,
    });

    return Promise.all([
      rateLimiter.consume(testKey),
      rateLimiter.consume(testKey),
    ]).then((resAll) => {
      expect(resAll[0].consumedPoints === 1 && resAll[1].consumedPoints === 2).to.equal(true);
    });
  });

  it('rejected when MemcachedClient error', (done) => {
    const testKey = 'memcacheerror';
    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheUnavailableClient,
      points: 1,
      duration: 5,
    });
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
        expect.fail('should not be resolved');
      })
      .catch(() => {
        done();
      });
  });

  it('consume using insuranceLimiter when MemcachedClient error', (done) => {
    const testKey = 'memcacheerror2';

    const rateLimiter = new RateLimiterMemcache({
      storeClient: memcacheUnavailableClient,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterMemcache({
        points: 2,
        duration: 2,
        storeClient: memcacheMockClient,
      }),
    });

    // Consume from insurance limiter with different options
    rateLimiter
      .consume(testKey)
      .then((res) => {
        expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.equal(true);
        done();
      })
      .catch((rejRes) => {
        done(rejRes);
      });
  });

  it('does not expire key if duration set to 0', (done) => {
    const testKey = 'neverexpire';
    const rateLimiter = new RateLimiterMemcache({storeClient: memcacheMockClient, points: 2, duration: 0});
    rateLimiter.consume(testKey, 1)
      .then(() => {
        rateLimiter.consume(testKey, 1)
          .then(() => {
            rateLimiter.get(testKey)
              .then((res) => {
                expect(res.consumedPoints).to.equal(2);
                expect(res.msBeforeNext).to.equal(-1);
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

  it('block key forever, if secDuration is 0', (done) => {
    const testKey = 'neverexpire';
    const rateLimiter = new RateLimiterMemcache({storeClient: memcacheMockClient, points: 1, duration: 1});
    rateLimiter.block(testKey, 0)
      .then(() => {
        setTimeout(() => {
          rateLimiter.get(testKey)
            .then((res) => {
              expect(res.consumedPoints).to.equal(2);
              expect(res.msBeforeNext).to.equal(-1);
              done();
            });
        }, 1000)
      })
      .catch((err) => {
        done(err);
      });
  });
});
