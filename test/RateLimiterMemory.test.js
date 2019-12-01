/* eslint-disable no-unused-expressions */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterMemory with fixed window', function RateLimiterMemoryTest() {
  this.timeout(5000);

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 5 });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        const res = rateLimiterMemory._memoryStorage.get(rateLimiterMemory.getKey(testKey));
        expect(res.consumedPoints).to.equal(1);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can not consume more than maximum points', (done) => {
    const testKey = 'consume2';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 5 });
    rateLimiterMemory.consume(testKey, 2)
      .then(() => {})
      .catch((rejRes) => {
        expect(rejRes.msBeforeNext >= 0).to.equal(true);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('execute evenly over duration with minimum delay 20 ms', (done) => {
    const testKey = 'consumeEvenlyMinDelay';
    const rateLimiterMemory = new RateLimiterMemory({
      points: 100, duration: 1, execEvenly: true, execEvenlyMinDelayMs: 20,
    });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiterMemory.consume(testKey)
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

  it('execute evenly over duration', (done) => {
    const testKey = 'consumeEvenly';
    const rateLimiterMemory = new RateLimiterMemory({
      points: 2, duration: 5, execEvenly: true, execEvenlyMinDelayMs: 1,
    });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiterMemory.consume(testKey)
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

  it('makes penalty', (done) => {
    const testKey = 'penalty1';
    const rateLimiterMemory = new RateLimiterMemory({ points: 3, duration: 5 });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        rateLimiterMemory.penalty(testKey)
          .then(() => {
            const res = rateLimiterMemory._memoryStorage.get(rateLimiterMemory.getKey(testKey));
            expect(res.consumedPoints).to.equal(2);
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

  it('reward points', (done) => {
    const testKey = 'reward1';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 5 });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        rateLimiterMemory.reward(testKey)
          .then(() => {
            const res = rateLimiterMemory._memoryStorage.get(rateLimiterMemory.getKey(testKey));
            expect(res.consumedPoints).to.equal(0);
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

  it('use keyPrefix from options', () => {
    const testKey = 'key';
    const keyPrefix = 'test';
    const rateLimiterMemory = new RateLimiterMemory({ keyPrefix, points: 1, duration: 5 });

    expect(rateLimiterMemory.getKey(testKey)).to.equal('test:key');
  });

  it('blocks key for block duration when consumed more than points', (done) => {
    const testKey = 'block';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 1, blockDuration: 2 });
    rateLimiterMemory.consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej.msBeforeNext > 1000).to.equal(true);
        done();
      });
  });

  it('do not block key second time until block expires no matter how many points consumed', (done) => {
    const testKey = 'donotblocktwice';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 1, blockDuration: 2 });
    rateLimiterMemory.consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch(() => {
        setTimeout(() => {
          rateLimiterMemory.consume(testKey)
            .then(() => {
              done(Error('must not resolve'));
            })
            .catch((rej) => {
              expect(rej.msBeforeNext < 1000).to.equal(true);
              done();
            });
        }, 1001);
      });
  });

  it('block expires in blockDuration seconds', (done) => {
    const testKey = 'blockexpires';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 1, blockDuration: 2 });
    rateLimiterMemory.consume(testKey, 2)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch(() => {
        setTimeout(() => {
          rateLimiterMemory.consume(testKey)
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
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    rateLimiterMemory.block(testKey, 2);
    rateLimiterMemory.consume(testKey)
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej.msBeforeNext > 1000 && rej.msBeforeNext <= 2000).to.equal(true);
        done();
      });
  });

  it('get by key', (done) => {
    const testKey = 'get';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 5 });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        rateLimiterMemory.get(testKey)
          .then((res) => {
            expect(res.remainingPoints).to.equal(1);
            done();
          });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('get resolves null if key is not set', (done) => {
    const testKey = 'getbynotexistingkey';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 5 });
    rateLimiterMemory.get(testKey)
      .then((res) => {
        expect(res).to.equal(null);
        done();
      });
  });

  it('delete resolves true if key is set', (done) => {
    const testKey = 'deletekey';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 5 });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        rateLimiterMemory.delete(testKey)
          .then((res) => {
            expect(res).to.equal(true);
            done();
          }).catch(() => {
            done(Error('must not reject'));
          });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume applies options.customDuration to set expire', (done) => {
    const testKey = 'options.customDuration';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 5 });
    rateLimiterMemory.consume(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.msBeforeNext <= 1000).to.be.true;
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty applies options.customDuration to set expire', (done) => {
    const testKey = 'options.customDuration';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 5 });
    rateLimiterMemory.penalty(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.msBeforeNext <= 1000).to.be.true;
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reward applies options.customDuration to set expire', (done) => {
    const testKey = 'options.customDuration';
    const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 5 });
    rateLimiterMemory.reward(testKey, 1, { customDuration: 1 })
      .then((res) => {
        expect(res.msBeforeNext <= 1000).to.be.true;
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('does not expire key if duration set to 0', (done) => {
    const testKey = 'neverexpire';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 0 });
    rateLimiterMemory.consume(testKey, 1)
      .then(() => {
        rateLimiterMemory.consume(testKey, 1)
          .then(() => {
            rateLimiterMemory.get(testKey)
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
});
