const RateLimiterInterface = require('./RateLimiterInterface');
const RateLimiterRes = require('./RateLimiterRes');
const RateLimiterMemory = require('./RateLimiterMemory');

const handleRedisError = function(funcName, resolve, reject, rlKey, pointsToConsume) {
  if (!(this.inMemoryLimiter instanceof RateLimiterMemory)) {
    reject(new Error('Redis Client error'));
  } else {
    this.inMemoryLimiter.consume(rlKey, pointsToConsume)
      .then((res) => {
        resolve(res);
      })
      .catch((res) => {
        reject(res);
      })
  }
};

const afterConsume = function(resolve, reject, rlKey, results) {
  const [resSet, consumed, resTtlMs] = results;
  const res = new RateLimiterRes();
  let isFirstInDuration = resSet === 'OK';

  res.remainingPoints = Math.max(this.points - consumed, 0);
  if (resTtlMs === -1) { // If rlKey created by incrby() not by set()
    isFirstInDuration = true;
    res.msBeforeNext = this.duration;
    this.redis.expire(rlKey, this.duration);
  } else {
    res.msBeforeNext = resTtlMs;
  }

  if (consumed > this.points) {
    reject(res);
  } else {
    if (this.execEvenly && res.msBeforeNext > 0 && !isFirstInDuration) {
      const delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
      setTimeout(resolve, delay, res);
    } else {
      resolve(res);
    }
  }
};

class RateLimiterRedis extends RateLimiterInterface {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterInterface
   *
   *   redis: RedisClient
   *   memoryInsurance: true, // Enable using current process memory to limit rates on Redis error
   * }
   */
  constructor(opts) {
    super(opts);

    this.redis = opts.redis;
    this.inMemoryLimiter = opts.inMemoryLimiter;
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

  get inMemoryLimiter() {
    return this._rateLimiterMemory;
  }

  set inMemoryLimiter(value) {
    if (typeof value !== 'undefined' && !(value instanceof RateLimiterMemory)) {
      throw new Error('inMemoryLimiter must be instance of RateLimiterMemory');
    }
    this._rateLimiterMemory = value;
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiterInterface.getKey(key);
      this.redis.multi()
        .set(rlKey, 0, 'EX', this.duration, 'NX')
        .incrby(rlKey, pointsToConsume)
        .pttl(rlKey)
        .exec((err, results) => {
          if (err) {
            handleRedisError.call(this, resolve, reject, rlKey, pointsToConsume);
          } else {
            afterConsume.call(this, resolve, reject, rlKey, results);
          }
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = RateLimiterInterface.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, points, (err, value) => {
        if (err) {
          handleRedisError.call(this, resolve, reject, rlKey, points);
        } else {
          resolve(value);
        }
      });
    });
  }

  reward(key, points = 1) {
    const rlKey = RateLimiterInterface.getKey(key);
    return new Promise((resolve, reject) => {
      this.redis.incrby(rlKey, -points, (err, value) => {
        if (err) {
          handleRedisError.call(this, resolve, reject, rlKey, points);
        } else {
          resolve(value);
        }
      });
    });
  }
}

module.exports = RateLimiterRedis;

