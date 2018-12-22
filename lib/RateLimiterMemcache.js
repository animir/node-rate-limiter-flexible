const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMemcache extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: memcacheClient
   * }
   */
  constructor(opts) {
    super(opts);

    this.client = opts.storeClient;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(result.consumedPoints);
    res.isFirstInDuration = result.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = result.msBeforeNext;

    return res;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false, attemptNumber = 1) {
    return new Promise((resolve, reject) => {
      const nowMs = Date.now();
      const secDuration = Math.floor(msDuration / 1000);

      if (forceExpire) {
        this.client.set(rlKey, points, secDuration, (err) => {
          if (!err) {
            this.client.set(`${rlKey}_expire`, nowMs + (secDuration * 1000), secDuration, () => {
              const res = {
                consumedPoints: points,
                msBeforeNext: secDuration * 1000,
              };
              resolve(res);
            });
          } else {
            reject(err);
          }
        });
      } else {
        this.client.incr(rlKey, points, (err, consumedPoints) => {
          if (err || consumedPoints === false) {
            this.client.add(rlKey, points, secDuration, (errAddKey, createdNew) => {
              if (errAddKey) {
                reject(errAddKey);
              } else if (!createdNew) {
                // Try to upsert again in case of race condition
                if (attemptNumber < 4) {
                  this._upsert(rlKey, points, msDuration, forceExpire, attemptNumber + 1)
                    .then(resUpsert => resolve(resUpsert))
                    .catch(errUpsert => reject(errUpsert));
                } else {
                  reject(new Error('Can not add key'));
                }
              } else {
                this.client.add(`${rlKey}_expire`, nowMs + (secDuration * 1000), secDuration, () => {
                  const res = {
                    consumedPoints: points,
                    msBeforeNext: secDuration * 1000,
                  };
                  resolve(res);
                });
              }
            });
          } else {
            this.client.get(`${rlKey}_expire`, (errGetExpire, resGetExpireMs) => {
              if (errGetExpire) {
                reject(errGetExpire);
              } else {
                const expireMs = !resGetExpireMs ? 0 : resGetExpireMs;
                const res = {
                  consumedPoints,
                  msBeforeNext: Math.max(expireMs - nowMs, 0),
                };
                resolve(res);
              }
            });
          }
        });
      }
    });
  }

  _get(rlKey) {
    return new Promise((resolve, reject) => {
      const nowMs = Date.now();

      this.client.get(rlKey, (err, consumedPoints) => {
        if (!consumedPoints) {
          resolve(null);
        } else {
          this.client.get(`${rlKey}_expire`, (errGetExpire, resGetExpireMs) => {
            if (errGetExpire) {
              reject(errGetExpire);
            } else {
              const expireMs = !resGetExpireMs ? 0 : resGetExpireMs;
              const res = {
                consumedPoints,
                msBeforeNext: Math.max(expireMs - nowMs, 0),
              };
              resolve(res);
            }
          });
        }
      });
    });
  }
}

module.exports = RateLimiterMemcache;
