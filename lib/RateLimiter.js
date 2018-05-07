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

  consume(key, points = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiter.getKey(key);
      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, points)
        .pttl(rlKey)
        .exec((err, results) => {
          let msBeforeReset = 0;

          if (err) {
            reject(new Error('Redis Client error'));
          } else {
            const [, consumed, resTtlMs] = results;
            if (resTtlMs === -1) {
              msBeforeReset = this.duration;
              this.redis.expire(rlKey, this.duration);
            } else {
              msBeforeReset = resTtlMs;
            }

            if (consumed > this.points) {
              reject(msBeforeReset); // eslint-disable-line prefer-promise-reject-errors
            } else {
              resolve(this.points - consumed);
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

