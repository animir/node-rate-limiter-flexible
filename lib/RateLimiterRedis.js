const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

// eslint-disable-next-line quotes
const incrTtlLuaScript = `redis.call('set', KEYS[1], 0, 'EX', ARGV[2], 'NX') \
local consumed = redis.call('incrby', KEYS[1], ARGV[1]) \
local ttl = redis.call('pttl', KEYS[1]) \
if ttl == -1 then \
  redis.call('expire', KEYS[1], ARGV[2]) \
  ttl = 1000 * ARGV[2] \
end \
return {consumed, ttl} \
`;

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

    this.isClientV4 = opts.clientStoreVersion === 4;

    if (typeof this.client.defineCommand === 'function') {
      this.client.defineCommand('rlflxIncr', {
        numberOfKeys: 1,
        lua: incrTtlLuaScript,
      });
    }
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let [consumed, resTtlMs] = result;
    // Support ioredis results format
    if (Array.isArray(consumed)) {
      [, consumed] = consumed;
      [, resTtlMs] = resTtlMs;
    }

    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(consumed);
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = resTtlMs;

    return res;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    const secDuration = Math.floor(msDuration / 1000);
    const multi = this.client.multi();

    if (this.isClientV4) {
      if (forceExpire) {
        if (secDuration > 0) {
          multi.set(rlKey, points, { EX: secDuration });
        } else {
          multi.set(rlKey, points);
        }

        return multi.pTTL(rlKey).exec(true);
      }

      if (secDuration > 0) {
        return this.client.eval(incrTtlLuaScript, {
          keys: [rlKey],
          arguments: [String(points), String(secDuration)],
        });
      }

      return multi.incrBy(rlKey, points).pTTL(rlKey).exec(true);
    }

    return new Promise((resolve, reject) => {
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

            return resolve(res);
          });
      } else {
        if (secDuration > 0) {
          const incrCallback = (err, result) => {
            if (err) {
              return reject(err);
            }

            return resolve(result);
          };

          if (typeof this.client.rlflxIncr === 'function') {
            this.client.rlflxIncr(rlKey, points, secDuration, incrCallback);
          } else {
            this.client.eval(incrTtlLuaScript, 1, rlKey, points, secDuration, incrCallback);
          }
        } else {
          multi.incrby(rlKey, points)
            .pttl(rlKey)
            .exec((err, res) => {
              if (err) {
                return reject(err);
              }

              return resolve(res);
            });
        }
      }
    });
  }

  _get(rlKey) {
    if (this.isClientV4) {
      return this.client
        .multi()
        .get(rlKey)
        .pTTL(rlKey)
        .exec(true)
        .then((result) => {
          const [points] = result;
          if (points === null) return null;
          return result;
        });
    }

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
              return resolve(null);
            }

            resolve(res);
          }
        });
    });
  }

  _delete(rlKey) {
    if (this.isClientV4) {
      return this.client
        .del(rlKey)
        .then(result => result > 0);
    }

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
