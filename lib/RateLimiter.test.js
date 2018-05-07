const expect = require('chai').expect;
const RateLimiter = require('./RateLimiter');
const redisMock = require('redis-mock');

const redisMockClient = redisMock.createClient();

describe('RateLimiter with fixed window', () => {
  it('consume 1 point', () => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiter(redisMockClient, {points: 2, duration: 10});
    rateLimiter.consume(testKey)
      .then(() => {
        redisMockClient.get(RateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('1');
          }
        })
      });
  });

  it('can not consume more than maximum points', () => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiter(redisMockClient, {points: 1, duration: 10});
    rateLimiter.consume(testKey, 2)
      .then(() => {})
      .catch((msBeforeReset) => {
        expect(msBeforeReset > 0).to.equal(true);
      });
  });

  it('makes penalty', () => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiter(redisMockClient, {points: 3, duration: 10});
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.penalty(testKey);
        redisMockClient.get(RateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('2');
          }
        })
      });
  });

  it('reward points', () => {
    const testKey = 'penalty2';
    const rateLimiter = new RateLimiter(redisMockClient, {points: 1, duration: 10});
    rateLimiter.consume(testKey)
      .then(() => {
        rateLimiter.reward(testKey);
        redisMockClient.get(RateLimiter.getKey(testKey), (err, consumedPoints) => {
          if (!err) {
            expect(consumedPoints).to.equal('0');
          }
        })
      });
  });
});