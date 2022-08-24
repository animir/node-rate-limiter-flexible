const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');
const RateLimiterRedis = require('./RateLimiterRedis');

class RateLimiterRedisNext extends RateLimiterStoreAbstract {
  constructor(options) {
    super(options);

    this.client = options.redis || options.storeClient;

    this._scripts = {
      increment: RateLimiterRedis.incrTtlLuaScript,
    };
  }

  _getRateLimiterRes(_key, changedPoints, result) {
    const [consumed, resTtlMs] = result;

    const consumedPoints = parseInt(consumed);
    const isFirstInDuration = consumedPoints === changedPoints;
    const remainingPoints = Math.max(this.points - consumedPoints, 0);
    const msBeforeNext = resTtlMs;

    return new RateLimiterRes(remainingPoints, msBeforeNext, consumedPoints, isFirstInDuration);
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    const multi = this.client.multi();

    if (forceExpire) {
      if (msDuration > 0) {
        multi.set(key, points, { PX: msDuration });
      } else {
        multi.set(key, points);
      }

      return multi.pTTL(key).exec(true);
    }

    if (msDuration > 0) {
      return this.client.eval(this._scripts.increment, {
        keys: [key],
        arguments: [String(points), String(msDuration)],
      });
    }

    return multi.incrBy(key, points).pTTL(key).exec(true);
  }

  _get(key) {
    return this.client
      .multi()
      .get(key)
      .pTTL(key)
      .exec(true)
      .then((result) => {
        const [points] = result;
        if (points === null) return null;
        return result;
      });
  }

  _delete(key) {
    return this.client.del(key).then(result => result > 0);
  }
}

module.exports = RateLimiterRedisNext;
