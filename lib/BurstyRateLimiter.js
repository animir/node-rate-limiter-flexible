const RateLimiterRes = require("./RateLimiterRes");

module.exports = class BurstyRateLimiter {
  constructor(rateLimiter, burstLimiter) {
    this._rateLimiter = rateLimiter;
    this._burstLimiter = burstLimiter;
    this.points = this._rateLimiter.points + this._burstLimiter.points;
  }

  consume(key, pointsToConsume = 1, options = {}) {
    return this._rateLimiter
      .consume(key, pointsToConsume, options)
      .then((rlRes) => {
        return this._burstLimiter.get(key).then((blRes) => {
          return this._combineRes(rlRes, blRes);
        });
      })
      .catch((rlRej) => {
        if (rlRej instanceof RateLimiterRes) {
          return this._burstLimiter
            .consume(key, pointsToConsume, options)
            .then((blRes) => {
              return this._combineRes(rlRej, blRes);
            })
            .catch((blRej) => {
              if (blRej instanceof RateLimiterRes) {
                return Promise.reject(this._combineRes(rlRej, blRej));
              } else {
                return Promise.reject(blRej);
              }
            });
        } else {
          return Promise.reject(rlRej);
        }
      });
  }

  get(key) {
    return Promise.all([
      this._rateLimiter.get(key),
      this._burstLimiter.get(key),
    ]).then(([rlRes, blRes]) => {
      return this._combineRes(rlRes, blRes);
    });
  }

  /**
   * Combine both rate limiter responses object into one.
   */
  _combineRes(rlRes, blRes) {
    const combinedRes = {
      remainingPoints:
        (rlRes ? rlRes.remainingPoints : this._rateLimiter.points) +
        (blRes ? blRes.remainingPoints : this._burstLimiter.points),
      msBeforeNext: Math.min(
        rlRes != null ? rlRes.msBeforeNext : this._rateLimiter.duration,
        blRes != null ? blRes.msBeforeNext : this._burstLimiter.duration
      ),
      consumedPoints: Math.min(
        (rlRes ? rlRes.consumedPoints : 0) + (blRes ? blRes.consumedPoints : 0),
        this._rateLimiter.points + this._burstLimiter.points
      ),
      isFirstInDuration: Boolean(
        rlRes && blRes
          ? rlRes.isFirstInDuration && blRes.isFirstInDuration
          : (rlRes && rlRes.isFirstInDuration) ||
              (blRes && blRes.isFirstInDuration)
      ),
    };

    return combinedRes;
  }
};
