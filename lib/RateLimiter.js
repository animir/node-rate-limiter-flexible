const RateLimiterRes = require('./RateLimiterRes');

const afterConsume = function(resolve, reject, rlKey, results) {
  const [resSet, consumed, resTtlMs] = results;
  const res = new RateLimiterRes();
  let isFirstInDuration = resSet === 'OK';

  res.remainingPoints = Math.max(this.points - consumed, 0);
  if (resTtlMs === -1) { // If rlKey created by incrby() not by set()
    isFirstInDuration = true;
    res.msBeforeNext = this.duration;
    this.redis.expire(rlKey, this.duration);
  } else {
    res.msBeforeNext = resTtlMs;
  }

  if (consumed > this.points) {
    reject(res);
  } else {
    if (this.execEvenly && res.msBeforeNext > 0 && !isFirstInDuration) {
      const delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
      setTimeout(resolve, delay, res);
    } else {
      resolve(res);
    }
  }
};

class RateLimiter {
  /**
   *
   * @param redis
   * @param opts Object Defaults {
   *   points: 4, // Number of points
   *   duration: 1, // Per seconds
   *   execEvenly: false, // Execute allowed actions evenly over duration
   * }
   */
  constructor(redis, opts = {}) {
    this.redis = redis;
    this.points = opts.points || 4;
    this.duration = opts.duration || 1;
    this.execEvenly = typeof opts.execEvenly === 'undefined' ? false : Boolean(opts.execEvenly);
  }

  static getKey(key) {
    return `rlflx:${key}`;
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiter.getKey(key);
      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, pointsToConsume)
        .pttl(rlKey)
        .exec((err, results) => {
          if (err) {
            reject(new Error('Redis Client error'));
          } else {
            afterConsume.call(this, resolve, reject, rlKey, results);
          }
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = RateLimiter.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, points, (err, value) => {
        if (err) {
          reject(err);
        }
        resolve(value);
      });
    });
  }

  reward(key, points = 1) {
    const rlKey = RateLimiter.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, -points, (err, value) => {
        if (err) {
          reject(err);
        }
        resolve(value);
      });
    });
  }
}

module.exports = RateLimiter;

