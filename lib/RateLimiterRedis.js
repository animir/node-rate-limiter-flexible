const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

const afterConsume = function (resolve, reject, rlKey, results) {
  let [resSet, consumed, resTtlMs] = results;
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

  if (res.consumedPoints > this.points) {
    // Block key for this.inmemoryBlockDuration seconds
    if (this.inmemoryBlockOnConsumed > 0 && res.consumedPoints >= this.inmemoryBlockOnConsumed) {
      this._blockedKeys.add(rlKey, this.inmemoryBlockDuration);
      res.msBeforeNext = this.msBlockDuration;
    }

    reject(res);
  } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
    const delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
    setTimeout(resolve, delay, res);
  } else {
    resolve(res);
  }
};

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

  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);

      const blockMsBeforeExpire = this.getBlockMsBeforeExpire(rlKey);
      if (blockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, blockMsBeforeExpire));
      }

      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, pointsToConsume)
        .pttl(rlKey)
        .exec((err, results) => {
          if (err) {
            this.handleError(err, 'consume', resolve, reject, key, pointsToConsume);
          } else {
            afterConsume.call(this, resolve, reject, rlKey, results);
          }
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, points, (err, consumedPoints) => {
        if (err) {
          this.handleError(err, 'penalty', resolve, reject, key, points);
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
          this.handleError(err, 'reward', resolve, reject, key, points);
        } else {
          resolve(new RateLimiterRes(this.points - consumedPoints, 0, consumedPoints));
        }
      });
    });
  }
}

module.exports = RateLimiterRedis;

