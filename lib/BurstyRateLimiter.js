const RateLimiterRes = require("./RateLimiterRes");

/**
 * Bursty rate limiter exposes only msBeforeNext time and doesn't expose points from bursty limiter by default
 * @type {BurstyRateLimiter}
 */
module.exports = class BurstyRateLimiter {
  constructor(rateLimiter, burstLimiter) {
    this._rateLimiter = rateLimiter;
    this._burstLimiter = burstLimiter
  }

  /**
   * Merge rate limiter response objects. Responses can be null
   *
   * @param {RateLimiterRes} [rlRes] Rate limiter response
   * @param {RateLimiterRes} [blRes] Bursty limiter response
   */
  _combineRes(rlRes, blRes) {
    if (!rlRes) {
      return null
    }

    return new RateLimiterRes(
      rlRes.remainingPoints,
      Math.min(rlRes.msBeforeNext, blRes ? blRes.msBeforeNext : 0),
      rlRes.consumedPoints,
      rlRes.isFirstInDuration
    )
  }

  /**
   * @param key
   * @param pointsToConsume
   * @param options
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1, options = {}) {
    return this._rateLimiter.consume(key, pointsToConsume, options)
      .catch((rlRej) => {
        if (rlRej instanceof RateLimiterRes) {
          return this._burstLimiter.consume(key, pointsToConsume, options)
            .then((blRes) => {
              return Promise.resolve(this._combineRes(rlRej, blRes))
            })
            .catch((blRej) => {
                if (blRej instanceof RateLimiterRes) {
                  return Promise.reject(this._combineRes(rlRej, blRej))
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

  /**
   * It doesn't expose available points from burstLimiter
   *
   * @param key
   * @returns {Promise<RateLimiterRes>}
   */
  get(key) {
    return Promise.all([
      this._rateLimiter.get(key),
      this._burstLimiter.get(key),
    ]).then(([rlRes, blRes]) => {
      return this._combineRes(rlRes, blRes);
    });
  }

  get points() {
    return this._rateLimiter.points;
  }
};
