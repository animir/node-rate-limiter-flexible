const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

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
    if (opts.redis) {
      this.client = opts.redis;
    } else {
      this.client = opts.storeClient;
    }
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let resSet, consumed, resTtlMs, secDuration
    let isKeyNeverExpired = false
    if (result.length === 2) {
      [consumed, resTtlMs] = result
      // Support ioredis results format
      if (Array.isArray(consumed)) {
        [, consumed] = consumed;
        [, resTtlMs] = resTtlMs;
      }
      isKeyNeverExpired = true
    } else {
      [resSet, consumed, resTtlMs, secDuration] = result
      // Support ioredis results format
      if (Array.isArray(resSet)) {
        [, resSet] = resSet;
        [, consumed] = consumed;
        [, resTtlMs] = resTtlMs;
      }
      if (resSet === 'FORCE' && secDuration === 0) {
        isKeyNeverExpired = true
      }
    }

    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(consumed);
    res.isFirstInDuration = resSet === 'OK';
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    // TODO: Fix Redis race conditions on transaction level with proper Lua script
    if (resTtlMs === -1 && !isKeyNeverExpired && resSet !== 'GET') {
      // If rlKey created by incrby() not by set(), this happens really rare
      res.isFirstInDuration = true;
      res.msBeforeNext = this.duration;
      this.client.expire(rlKey, this.duration);
    } else {
      res.msBeforeNext = resTtlMs;
    }

    return res;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    return new Promise((resolve, reject) => {
      const secDuration = Math.floor(msDuration / 1000);
      const multi = this.client.multi();
      if (forceExpire) {
        if (secDuration > 0) {
          multi.set(rlKey, points, 'EX', secDuration);
        } else {
          multi.set(rlKey, points);
        }

        multi.pttl(rlKey)
          .exec((err, res) => {
            if (err) {
              return reject(err);
            }

            return resolve(['FORCE', points, res[1], secDuration]);
          });
      } else {
        if (secDuration > 0) {
          multi.set(rlKey, 0, 'EX', secDuration, 'NX');
        }

        multi.incrby(rlKey, points)
          .pttl(rlKey)
          .exec((err, res) => {
            if (err) {
              return reject(err);
            }

            return resolve(res);
          });
      }
    });
  }

  _get(rlKey) {
    return new Promise((resolve, reject) => {
      this.client
        .multi()
        .get(rlKey)
        .pttl(rlKey)
        .exec((err, res) => {
          if (err) {
            reject(err);
          } else {
            const [points] = res;
            if (points === null) {
              res = null;
            } else if (Array.isArray(points)) {
              // Support ioredis format
              res.unshift([null, 'GET']);
            } else {
              res.unshift('GET');
            }

            resolve(res);
          }
        });
    });
  }

  _delete(rlKey) {
    return new Promise((resolve, reject) => {
      this.client.del(rlKey, (err, res) => {
        if (err) {
          reject(err);
        } else {
          resolve(res > 0);
        }
      });
    });
  }
}

module.exports = RateLimiterRedis;
