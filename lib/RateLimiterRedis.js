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

    this.redis = opts.redis;
  }

  get redis() {
    return this._redis;
  }

  set redis(value) {
    if (typeof value === 'undefined') {
      throw new Error('redis is not set');
    }
    this._redis = value;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let [resSet, consumed, resTtlMs] = result;
    // Support ioredis results format
    if (Array.isArray(resSet)) {
      [, resSet] = resSet;
      [, consumed] = consumed;
      [, resTtlMs] = resTtlMs;
    }
    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(consumed);
    res.isFirstInDuration = resSet === 'OK';
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    if (resTtlMs === -1) { // If rlKey created by incrby() not by set()
      res.isFirstInDuration = true;
      res.msBeforeNext = this.duration;
      this.redis.expire(rlKey, this.duration);
    } else {
      res.msBeforeNext = resTtlMs;
    }

    return res;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    return new Promise((resolve, reject) => {
      const secDuration = Math.floor(msDuration / 1000);
      if (forceExpire) {
        this.redis.multi()
          .set(rlKey, points, 'EX', secDuration)
          .pttl(rlKey)
          .exec((err, res) => {
            if (err) {
              return reject(err);
            }

            return resolve(['FORCE', points, res[1]]);
          });
      } else {
        this.redis.multi()
          .set(rlKey, 0, 'EX', secDuration, 'NX')
          .incrby(rlKey, points)
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
      this.redis.multi()
        .get(rlKey)
        .pttl(rlKey)
        .exec((err, res) => {
          if (err) {
            reject(err);
          } else {
            const [points] = res;
            if (points === null) {
              res = null;
            } else {
              res.unshift('GET');
            }
            resolve(res);
          }
        });
    });
  }
}

module.exports = RateLimiterRedis;

