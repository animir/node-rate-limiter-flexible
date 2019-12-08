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

  _upsert(rlKey, points, msDuration, forceExpire = false, options = {}) {
    return new Promise((resolve, reject) => {
      const nowMs = Date.now();
      const secDuration = Math.floor(msDuration / 1000);

      if (forceExpire) {
        this.client.set(rlKey, points, secDuration, (err) => {
          if (!err) {
            this.client.set(
              `${rlKey}_expire`,
              secDuration > 0 ? nowMs + (secDuration * 1000) : -1,
              secDuration,
              () => {
                const res = {
                  consumedPoints: points,
                  msBeforeNext: secDuration > 0 ? secDuration * 1000 : -1,
                };
                resolve(res);
              }
            );
          } else {
            reject(err);
          }
        });
      } else {
        this.client.incr(rlKey, points, (err, consumedPoints) => {
          if (err || consumedPoints === false) {
            this.client.add(rlKey, points, secDuration, (errAddKey, createdNew) => {
              if (errAddKey || !createdNew) {
                // Try to upsert again in case of race condition
                if (typeof options.attemptNumber === 'undefined' || options.attemptNumber < 3) {
                  const nextOptions = Object.assign({}, options);
                  nextOptions.attemptNumber = nextOptions.attemptNumber ? (nextOptions.attemptNumber + 1) : 1;

                  this._upsert(rlKey, points, msDuration, forceExpire, nextOptions)
                    .then(resUpsert => resolve(resUpsert))
                    .catch(errUpsert => reject(errUpsert));
                } else {
                  reject(new Error('Can not add key'));
                }
              } else {
                this.client.add(
                  `${rlKey}_expire`,
                  secDuration > 0 ? nowMs + (secDuration * 1000) : -1,
                  secDuration,
                  () => {
                    const res = {
                      consumedPoints: points,
                      msBeforeNext: secDuration > 0 ? secDuration * 1000 : -1,
                    };
                    resolve(res);
                  }
                );
              }
            });
          } else {
            this.client.get(`${rlKey}_expire`, (errGetExpire, resGetExpireMs) => {
              if (errGetExpire) {
                reject(errGetExpire);
              } else {
                const expireMs = resGetExpireMs === false ? 0 : resGetExpireMs;
                const res = {
                  consumedPoints,
                  msBeforeNext: expireMs >= 0 ? Math.max(expireMs - nowMs, 0) : -1,
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
              const expireMs = resGetExpireMs === false ? 0 : resGetExpireMs;
              const res = {
                consumedPoints,
                msBeforeNext: expireMs >= 0 ? Math.max(expireMs - nowMs, 0) : -1,
              };
              resolve(res);
            }
          });
        }
      });
    });
  }

  _delete(rlKey) {
    return new Promise((resolve, reject) => {
      this.client.del(rlKey, (err, res) => {
        if (err) {
          reject(err);
        } else if (res === false) {
          resolve(res);
        } else {
          this.client.del(`${rlKey}_expire`, (errDelExpire) => {
            if (errDelExpire) {
              reject(errDelExpire);
            } else {
              resolve(res);
            }
          });
        }
      });
    });
  }
}

module.exports = RateLimiterMemcache;
