const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterMemory with fixed window', function () {
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

  it('consume evenly over duration', (done) => {
    const testKey = 'consumeEvenly';
    const rateLimiterMemory = new RateLimiterMemory({ points: 2, duration: 5, execEvenly: true });
    rateLimiterMemory.consume(testKey)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiterMemory.consume(testKey)
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
});
