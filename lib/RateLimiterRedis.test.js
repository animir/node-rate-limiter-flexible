const expect = require('chai').expect;
const RateLimiterRedis = require('./RateLimiterRedis');
const redisMock = require('redis-mock');

describe('RateLimiterRedis with fixed window', function() {
  this.timeout(5000);
  let redisMockClient;

  beforeEach(() => {
    redisMockClient = redisMock.createClient();
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterRedis({redis: redisMockClient, points: 2, duration: 5});
    rateLimiter.consume(testKey)
      .then(() => {
        redisMockClient.get(RateLimiterRedis.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('1');
            done();
          }
        })
      })
      .catch((err) => {
        done(err);
      });
  });

  it('can not consume more than maximum points', (done) => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterRedis({redis: redisMockClient, points: 1, duration: 5});
    rateLimiter.consume(testKey, 2)
      .then(() => {})
      .catch((rejRes) => {
        expect(rejRes.msBeforeNext >= 0).to.equal(true);
        done();
      })
  });

  // !!! Uncomment when redis-mock bug fixed
  // https://github.com/yeahoffline/redis-mock/pull/67/commits/d1936e5260da8bde252d55e93f01b8f6008de322
  //
  // it('consume evenly over duration', (done) => {
  //   const testKey = 'consumeEvenly';
  //   const rateLimiter = new RateLimiterRedis({redis: redisMockClient, points: 2, duration: 5, execEvenly: true});
  //   rateLimiter.consume(testKey)
  //     .then(() => {
  //       const timeFirstConsume = Date.now();
  //       rateLimiter.consume(testKey)
  //         .then(() => {
  //           /* Second consume should be delayed more than 2 seconds
  //              Explanation:
  //              1) consume at 0ms, remaining duration = 4444ms
  //              2) delayed consume for (4444 / (0 + 2)) ~= 2222ms, where 2 is a fixed value
  //               , because it mustn't delay in the beginning and in the end of duration
  //              3) consume after 2222ms by timeout
  //           */
  //           expect(Date.now() - timeFirstConsume > 2000).to.equal(true);
  //           done();
  //         })
  //         .catch((err) => {
  //           done(err);
  //         });
  //     })
  //     .catch((err) => {
  //       done(err);
  //     });
  // });

  it('makes penalty', (done) => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiterRedis({redis: redisMockClient, points: 3, duration: 5});
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.penalty(testKey)
          .then(() => {
            redisMockClient.get(RateLimiterRedis.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal('2');
                done();
              }
            })
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
    const rateLimiter = new RateLimiterRedis({redis: redisMockClient, points: 1, duration: 5});
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.reward(testKey)
          .then(() => {
            redisMockClient.get(RateLimiterRedis.getKey(testKey), (err, consumedPoints) => {
              if (!err) {
                expect(consumedPoints).to.equal('0');
                done();
              }
            })
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