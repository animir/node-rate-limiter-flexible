class RateLimiter {
  /**
   *
   * @param redis
   * @param opts Object Defaults {
   *   limit: 4, // Number of requests allowed
   *   duration: 1, // Per seconds
   * }
   */
  constructor(redis, opts = {}) {
    this.redis = redis;
    this.limit = opts.limit || 4;
    this.duration = opts.duration || 1;
  }

  static getKey(key) {
    return `rlflx:${key}`;
  }

  consume(key, rate = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiter.getKey(key);
      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, rate)
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

            if (consumed > this.limit) {
              reject(null, msBeforeReset); // eslint-disable-line prefer-promise-reject-errors
            } else {
              resolve(this.limit - consumed);
            }
          }
        });
    });
  }

  penalty(key, rate = 1) {
    const rlKey = RateLimiter.getKey(key);
    this.redis.incrby(rlKey, rate);
  }

  reward(key, rate = 1) {
    const rlKey = RateLimiter.getKey(key);
    this.redis.decrby(rlKey, rate);
  }
}

module.exports = RateLimiter;

