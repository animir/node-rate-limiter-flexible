// eslint-disable-next-line object-curly-newline
const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');

const RateLimiterEtcd = require('../lib/RateLimiterEtcd');
const EtcdClient = require('../lib/component/EtcdClient/EtcdClient');

describe('RateLimiterEtcd', function RateLimiterEtcdTest() {
  this.timeout(5500);

  const testKey = 'key';

  const etcdClient = new EtcdClient('localhost', 8082);
  const etcdInsurance = new EtcdClient('localhost', 8082);

  beforeEach(async () => {
    const rateLimiter = new RateLimiterEtcd({});
    await rateLimiter.delete(testKey);
  });

  afterEach(async () => {
    sinon.restore();
  });

  it('consume 1 point', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 5,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter.get(testKey).then((result) => {
          expect(result.consumedPoints).to.equal(1);
          done();
        });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('rejected when consume more than maximum points', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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

  it('execute evenly over duration', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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
            // Second consume should be delayed more than 2 seconds
            // Explanation:
            // 1) consume at 0ms, remaining duration = 5000ms
            // 2) delayed consume for (4999 / (0 + 2)) ~= 2500ms, where 2 is a fixed value,
            //    because it mustn't delay in the beginning and in the end of duration
            // 3) consume after 2500ms by timeout
            const diff = Date.now() - timeFirstConsume;
            expect(diff > 2400 && diff < 5100).to.equal(true);
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
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 3,
      duration: 5,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .penalty(testKey)
          .then(() => {
            rateLimiter.get(testKey).then((result) => {
              expect(result.consumedPoints).to.equal(2);
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

  it('reward points', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 5,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .reward(testKey)
          .then(() => {
            rateLimiter.get(testKey).then((result) => {
              expect(result.consumedPoints).to.equal(0);
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

  it('block key in memory when inMemory block options set up', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 10,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .consume(testKey)
          .then(() => {})
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

  it('block key in memory for msBeforeNext milliseconds', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 1,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        expect(rateLimiter._inMemoryBlockedKeys.msBeforeExpire(rateLimiter.getKey(testKey)) > 0).to.equal(true);
        done();
      })
      .catch((rejRes) => {
        done(rejRes);
      });
  });

  it('reject after block key in memory for msBeforeNext, if consumed more than points', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 1,
    });

    rateLimiter
      .consume(testKey, 2)
      .then(() => {
        done(new Error('must not'));
      })
      .catch(() => {
        expect(rateLimiter._inMemoryBlockedKeys.msBeforeExpire(rateLimiter.getKey(testKey)) > 0).to.equal(true);
        done();
      });
  });

  it('throws error when inMemoryBlockOnConsumed is not set, but inMemoryBlockDuration is set', (done) => {
    try {
      const rateLimiter = new RateLimiterEtcd({
        storeClient: etcdClient,
        inMemoryBlockDuration: 2,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('throws error when inMemoryBlockOnConsumed less than points', (done) => {
    try {
      const rateLimiter = new RateLimiterEtcd({
        storeClient: etcdClient,
        points: 2,
        inMemoryBlockOnConsumed: 1,
      });
      rateLimiter.reward('test');
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('throws error on RedisClient error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
    });

    await rateLimiter
      .consume(testKey)
      .then(() => {})
      .catch((rejRes) => {
        expect(rejRes instanceof Error).to.equal(true);
      });
  });

  it('consume using insuranceLimiter when RedisClient error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterEtcd({
        storeClient: etcdInsurance,
        points: 2,
        duration: 2,
      }),
    });

    // Consume from insurance limiter with different options
    await rateLimiter
      .consume(testKey)
      .then((res) => {
        expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.equal(true);
      });
  });

  it('penalty using insuranceLimiter when RedisClient error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterEtcd({
        storeClient: etcdInsurance,
        points: 2,
        duration: 2,
      }),
    });

    await rateLimiter
      .penalty(testKey);

    await rateLimiter.get(testKey).then((result) => {
      expect(result.consumedPoints).to.equal(1);
    });
  });

  it('reward using insuranceLimiter when RedisClient error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterEtcd({
        storeClient: etcdInsurance,
        points: 2,
        duration: 2,
      }),
    });

    await rateLimiter
      .consume(testKey, 2)
      .then(() => {
      })
      .catch(() => {
      });
    await rateLimiter
      .reward(testKey);
    await rateLimiter.get(testKey).then((result) => {
      expect(result.consumedPoints).to.equal(1);
    });
  });

  it('block using insuranceLimiter when RedisClient error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterEtcd({
        storeClient: etcdInsurance,
        points: 1,
        duration: 1,
      }),
    });

    await rateLimiter
      .block(testKey, 3)
      .then((res) => {
        expect(res.msBeforeNext > 2000 && res.msBeforeNext <= 3000).to.equal(true);
      });
  });

  it('use keyPrefix from options', () => {
    const keyPrefix = 'test';
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      keyPrefix,
    });

    expect(rateLimiter.getKey(testKey)).to.equal('test:key');
  });

  it('blocks key for block duration when consumed more than points', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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

  it('reject with error, if internal block by blockDuration failed', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
      blockDuration: 2,
    });
    sinon.stub(rateLimiter, '_block').callsFake(() => Promise.reject(new Error()));
    rateLimiter
      .consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej instanceof Error).to.equal(true);
        done();
      });
  });

  it('get points', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 1,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter.delete(testKey)
          .then((resDel) => {
            expect(resDel).to.equal(true);
            done();
          });
      });
  });

  it('delete returns false, if there is no key', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 1,
    });
    rateLimiter.delete(testKey)
      .then((resDel) => {
        expect(resDel).to.equal(false);
        done();
      });
  });

  it('delete rejects on error', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 1,
    });
    await rateLimiter.delete(testKey)
      .catch(() => {});
  });

  it('consume applies options.customDuration to set expire', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 5,
    });

    rateLimiter
      .consume(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.msBeforeNext <= 1000).to.equal(true);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('insurance limiter on error consume applies options.customDuration to set expire', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 5,
    });

    rateLimiter
      .consume(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.msBeforeNext <= 1000).to.equal(true);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('insurance limiter on error consume applies options.customDuration to set expire', async () => {
    sinon.stub(etcdClient, '_httpPost').rejects();

    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 2,
      insuranceLimiter: new RateLimiterEtcd({
        storeClient: etcdInsurance,
        points: 2,
        duration: 3,
      }),
    });

    // Consume from insurance limiter with different options
    await rateLimiter
      .consume(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.remainingPoints === 1 && res.msBeforeNext <= 1000).to.equal(true);
      });
  });

  it('block key in memory works with blockDuration on store', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 5,
      blockDuration: 10,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 10,
    });

    rateLimiter
      .consume(testKey)
      .then(() => {
        rateLimiter
          .consume(testKey)
          .then(() => {})
          .catch((rejRes) => {
            rateLimiter.get(testKey)
              .then((getRes) => {
                expect(getRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.equal(true);
                // msBeforeNext more than 5000, so key was blocked in memory
                expect(rejRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.equal(true);
                done();
              });
          });
      })
      .catch((rejRes) => {
        done(rejRes);
      });
  });

  it('does not expire key if duration set to 0', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 2,
      duration: 0,
    });

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
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
    });

    rateLimiter.block(testKey, 0)
      .then(() => {
        setTimeout(() => {
          rateLimiter.get(testKey)
            .then((res) => {
              expect(res.consumedPoints).to.equal(2);
              expect(res.msBeforeNext).to.equal(-1);
              done();
            });
        }, 2000);
      })
      .catch((err) => {
        done(err);
      });
  });

  it('set points by key', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
      points: 1,
      duration: 1,
    });

    rateLimiter.set(testKey, 12)
      .then(() => {
        rateLimiter.get(testKey)
          .then((res) => {
            expect(res.consumedPoints).to.equal(12);
            done();
          });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('set points by key forever', (done) => {
    const rateLimiter = new RateLimiterEtcd({
      storeClient: etcdClient,
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
