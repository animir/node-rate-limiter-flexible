const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

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
   *   rejectIfRedisNotReady: boolean = false - reject / invoke insuranceLimiter immediately when redis connection is not "ready"
   * }
   */
  constructor(opts) {
    super(opts);
    this.client = opts.storeClient;

    this._rejectIfRedisNotReady = !!opts.rejectIfRedisNotReady;
    this._incrTtlLuaScript = opts.customIncrTtlLuaScript || incrTtlLuaScript;

    this.useRedisPackage = opts.useRedisPackage || this.client.constructor.name === 'Commander' || false;
    this.useRedis3AndLowerPackage = opts.useRedis3AndLowerPackage;
    if (typeof this.client.defineCommand === 'function') {
      this.client.defineCommand("rlflxIncr", {
        numberOfKeys: 1,
        lua: this._incrTtlLuaScript,
      });
    }
  }

  /**
   * Prevent actual redis call if redis connection is not ready
   * Because of different connection state checks for ioredis and node-redis, only this clients would be actually checked.
   * For any other clients all the requests would be passed directly to redis client
   * @return {boolean}
   * @private
   */
  _isRedisReady() {
    if (!this._rejectIfRedisNotReady) {
      return true;
    }
    // ioredis client
    if (this.client.status && this.client.status !== 'ready') {
      return false;
    }
    // node-redis client
    if (typeof this.client.isReady === 'function' && !this.client.isReady()) {
      return false;
    }
    return true;
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

  async _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (!this._isRedisReady()) {
      throw new Error('Redis connection is not ready');
    }

    const secDuration = Math.floor(msDuration / 1000);
    const multi = this.client.multi();

    if (forceExpire) {
      if (secDuration > 0) {
        if(!this.useRedisPackage && !this.useRedis3AndLowerPackage){
          multi.set(rlKey, points, "EX", secDuration);
        }else{
          multi.set(rlKey, points, { EX: secDuration });
        }
      } else {
        multi.set(rlKey, points);
      }

      if(!this.useRedisPackage && !this.useRedis3AndLowerPackage){
        return multi.pttl(rlKey).exec(true);
      }
      return multi.pTTL(rlKey).exec(true);
    }

    if (secDuration > 0) {
      if(!this.useRedisPackage && !this.useRedis3AndLowerPackage){
        return this.client.rlflxIncr(
          [rlKey].concat([String(points), String(secDuration), String(this.points), String(this.duration)]));
      }
      if (this.useRedis3AndLowerPackage) {
        return new Promise((resolve, reject) => {
          const incrCallback = function (err, result) {
            if (err) {
              return reject(err);
            }

            return resolve(result);
          };

          if (typeof this.client.rlflxIncr === 'function') {
            this.client.rlflxIncr(rlKey, points, secDuration, this.points, this.duration, incrCallback);
          } else {
            this.client.eval(this._incrTtlLuaScript, 1, rlKey, points, secDuration, this.points, this.duration, incrCallback);
          }
        });
      } else {
        return this.client.eval(this._incrTtlLuaScript, {
          keys: [rlKey],
          arguments: [String(points), String(secDuration), String(this.points), String(this.duration)],
        });
      }
    } else {
      if(!this.useRedisPackage && !this.useRedis3AndLowerPackage){
        return multi.incrby(rlKey, points).pttl(rlKey).exec(true);
      }

      return multi.incrBy(rlKey, points).pTTL(rlKey).exec(true);
    }
  }

  async _get(rlKey) {
    if (!this._isRedisReady()) {
      throw new Error('Redis connection is not ready');
    }
    if(!this.useRedisPackage && !this.useRedis3AndLowerPackage){
      return this.client
        .multi()
        .get(rlKey)
        .pttl(rlKey)
        .exec()
        .then((result) => {
          const [[,points]] = result;
          if (points === null) return null;
          return result;
        });
    }

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

  _delete(rlKey) {
    return this.client
      .del(rlKey)
      .then(result => result > 0);
  }
}

module.exports = RateLimiterRedis;
