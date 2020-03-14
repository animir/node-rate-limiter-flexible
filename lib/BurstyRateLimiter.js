const RateLimiterRes = require("./RateLimiterRes");

module.exports = class BurstyRateLimiter {
  constructor(rateLimiter, burstLimiter) {
    this._rateLimiter = rateLimiter;
    this._burstLimiter = burstLimiter
  }

  consume(key, pointsToConsume = 1, options = {}) {
    return this._rateLimiter.consume(key, pointsToConsume, options)
      .catch((rlRej) => {
        if (rlRej instanceof RateLimiterRes) {
          return this._burstLimiter.consume(key, pointsToConsume, options)
            .then(() => {
              return Promise.resolve(rlRej)
            })
            .catch((blRej) => {
                if (blRej instanceof RateLimiterRes) {
                  return Promise.reject(rlRej)
                } else {
                  return Promise.reject(blRej)
                }
              }
            )
        } else {
          return Promise.reject(rlRej)
        }
      })
  }
};
