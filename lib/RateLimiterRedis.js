const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterRedis extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   redis: RedisClient
   * }
   */
  constructor(opts) {
    super(opts);

    this.redis = opts.redis;
  }

  get redis() {
    return this._redis;
  }

  set redis(value) {
    if (typeof value === 'undefined') {
      throw new Error('redis is not set');
    }
    this._redis = value;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let [resSet, consumed, resTtlMs] = result;
    // Support ioredis results format
    if (Array.isArray(resSet)) {
      [, resSet] = resSet;
      [, consumed] = consumed;
      [, resTtlMs] = resTtlMs;
    }
    const res = new RateLimiterRes();
    res.consumedPoints = consumed;
    res.isFirstInDuration = resSet === 'OK';
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    if (resTtlMs === -1) { // If rlKey created by incrby() not by set()
      res.isFirstInDuration = true;
      res.msBeforeNext = this.duration;
      this.redis.expire(rlKey, this.duration);
    } else {
      res.msBeforeNext = resTtlMs;
    }

    return res;
  }

  _block(rlKey, initPoints, msDuration) {
    return new Promise((resolve, reject) => {
      this.redis.set(rlKey, initPoints, 'EX', Math.floor(msDuration / 1000), (err) => {
        if (err) {
          return this._handleError(err, 'block', resolve, reject, this.parseKey(rlKey), initPoints);
        }

        resolve(new RateLimiterRes(0, msDuration, initPoints));
      });
    });
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);

      const inmemoryBlockMsBeforeExpire = this.getInmemoryBlockMsBeforeExpire(rlKey);
      if (inmemoryBlockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, inmemoryBlockMsBeforeExpire));
      }

      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, pointsToConsume)
        .pttl(rlKey)
        .exec((err, results) => {
          if (err) {
            this._handleError(err, 'consume', resolve, reject, key, pointsToConsume);
          } else {
            this._afterConsume(resolve, reject, rlKey, pointsToConsume, results);
          }
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, points, (err, consumedPoints) => {
        if (err) {
          this._handleError(err, 'penalty', resolve, reject, key, points);
        } else {
          resolve(new RateLimiterRes(this.points - consumedPoints, 0, consumedPoints));
        }
      });
    });
  }

  reward(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, -points, (err, consumedPoints) => {
        if (err) {
          this._handleError(err, 'reward', resolve, reject, key, points);
        } else {
          resolve(new RateLimiterRes(this.points - consumedPoints, 0, consumedPoints));
        }
      });
    });
  }
}

module.exports = RateLimiterRedis;

