const RateLimiterRes = require('./RateLimiterRes');

class RateLimiter {
  /**
   *
   * @param redis
   * @param opts Object Defaults {
   *   points: 4, // Number of points
   *   duration: 1, // Per seconds
   * }
   */
  constructor(redis, opts = {}) {
    this.redis = redis;
    this.points = opts.points || 4;
    this.duration = opts.duration || 1;
  }

  static getKey(key) {
    return `rlflx:${key}`;
  }

  /**
   *
   * @param key
   * @param points
   * @returns {Promise<any>}
   */
  consume(key, points = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiter.getKey(key);
      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, points)
        .pttl(rlKey)
        .exec((err, results) => {
          const res = new RateLimiterRes();

          if (err) {
            reject(new Error('Redis Client error'));
          } else {
            const [, consumed, resTtlMs] = results;

            res.points = Math.max(this.points - consumed, 0);
            if (resTtlMs === -1) {
              res.msBeforeNext = this.duration;
              this.redis.expire(rlKey, this.duration);
            } else {
              res.msBeforeNext = resTtlMs;
            }

            if (consumed > this.points) {
              reject(res);
            } else {
              resolve(res);
            }
          }
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = RateLimiter.getKey(key);
    this.redis.incrby(rlKey, points);
  }

  reward(key, points = 1) {
    const rlKey = RateLimiter.getKey(key);
    this.redis.incrby(rlKey, -points);
  }
}

module.exports = RateLimiter;

