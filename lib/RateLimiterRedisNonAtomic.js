const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");
const RateLimiterRes = require("./RateLimiterRes");

const incrTtlLuaScript = `redis.call('set', KEYS[1], 0, 'EX', ARGV[2], 'NX') \
local consumed = redis.call('incrby', KEYS[1], ARGV[1]) \
local ttl = redis.call('pttl', KEYS[1]) \
if ttl == -1 then \
  redis.call('expire', KEYS[1], ARGV[2]) \
  ttl = 1000 * ARGV[2] \
end \
return {consumed, ttl} \
`;

/**
 * RateLimiterRedisNonAtomic is a rate limiter that uses Redis for storage.
 * It is designed to be non-atomic, meaning it does not guarantee that limit checking and update operations are performed atomically.
 * Advantages : 
 *  1. It will be faster than RateLimiterRedis, as it does not wait till the Lua script is executed.
 *  2. Using lua scripts means that all operations are write operations that would go to a single Redis master write node, making read nodes useless.
 *     This implementation allows for read operations to be distributed across multiple Redis nodes, hence making it more scalable and faster.
 * Disadvantages :
 *  1. This will be useful in scenarios where you want to allow concurrency and are okay with potential over-consumption of points till the read values are synced by redis.
 */

class RateLimiterRedisNonAtomic extends RateLimiterStoreAbstract {
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

    this.useRedisPackage =
      opts.useRedisPackage ||
      this.client.constructor.name === "Commander" ||
      false;
    this.useRedis3AndLowerPackage = opts.useRedis3AndLowerPackage;
    if (typeof this.client.defineCommand === "function") {
      this.client.defineCommand("rlflxIncr", {
        numberOfKeys: 1,
        lua: this._incrTtlLuaScript,
      });
    }

    // set up the initial state for update tries failures
    this._updateTriesFailures = 0;
    this._updateTriesFailuresLimit = opts.updateTriesFailuresLimit || 5;
    this._updateTriesFailureError = opts.updateTriesFailureError || new Error("Update tries failures limit reached");

    // should throw error if customIncrTtlLuaScript is set
    // the upsert operation is not atomic, so custom lua script is not allowed here.
    if (opts.customIncrTtlLuaScript) {
      throw new Error(
        "customIncrTtlLuaScript is not allowed in RateLimiterRedisNonAtomic as it is a non atomic operation."
      );
      
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
    if (this.client.status && this.client.status !== "ready") {
      return false;
    }
    // node-redis client
    if (typeof this.client.isReady === "function" && !this.client.isReady()) {
      return false;
    }
    return true;
  }

  /**
   * Check if the update tries failures limit has been reached.
   * If it has, return true, otherwise false.
   */
  _isUpdateTriesFailuresLimitReached() {
    return this._updateTriesFailures >= this._updateTriesFailuresLimit;
  }

  /**
   * Increment the update tries failures count.
   * This method is called when an update operation fails.
   */
  _incrementUpdateTriesFailures(error) {
    this._updateTriesFailures += 1;
    this._updateTriesFailureError = error;
  }

  /**
   * Reset the update tries failures count.
   * This method is called when an update operation succeeds.
   */
  _resetUpdateTriesFailures() {
    this._updateTriesFailures = 0;
    this._updateTriesFailureError = null;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    console.log("getRateLimiterRes called with", rlKey, changedPoints, result);
    let [consumed, resTtlMs] = result;
    // Support ioredis results format
    if (Array.isArray(consumed)) {
      [, consumed] = consumed;
      [, resTtlMs] = resTtlMs;
    }

    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(consumed);
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    // set remaining points to 0 if redis has an update problem
    if (this._isUpdateTriesFailuresLimitReached()) {
      console.warn(
        `Update tries failures limit reached: ${this._updateTriesFailuresLimit}, error : ${this._updateTriesFailureError}. Returning 0 remaining points.`
      );
      res.remainingPoints = 0;
      res.msBeforeNext = 0;
      res.error = this._updateTriesFailureError;
    } else {
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      res.msBeforeNext = resTtlMs;
    }

    console.log("getRateLimiterRes result:", res);
    return res;
  }

  _validateUpsert(rlKey, points, msDuration, forceExpire = false) {
          if (typeof points == "string") {
        if (!RegExp("^[1-9][0-9]*$").test(points)) {
          throw new Error(
            "Consuming string different than integer values is not supported by this package"
          );
        }
      } else if (!Number.isInteger(points)) {
        throw new Error(
          "Consuming decimal number of points is not supported by this package"
        );
      }

      if (!this._isRedisReady()) {
        throw new Error("Redis connection is not ready");
      }
    }

  async _upsertAndUpdateUpsertAttempts(rlKey, points, msDuration, forceExpire = false, needValidation = true) {
    let isUpsertSuccessful = true;
    // Log the upsert call for debugging
    console.log("_upsertAndUpdateUpsertAttempts called with", rlKey, points, msDuration, forceExpire);
    try {
      if (needValidation) {
        this._validateUpsert(rlKey, points, msDuration, forceExpire);
      }
      const secDuration = Math.floor(msDuration / 1000);
      const multi = this.client.multi();

      if (forceExpire) {
        if (secDuration > 0) {
          if (!this.useRedisPackage && !this.useRedis3AndLowerPackage) {
            multi.set(rlKey, points, "EX", secDuration);
          } else {
            multi.set(rlKey, points, { EX: secDuration });
          }
        } else {
          multi.set(rlKey, points);
        }

        if (!this.useRedisPackage && !this.useRedis3AndLowerPackage) {
          return multi.pttl(rlKey).exec(true);
        }
        return multi.pTTL(rlKey).exec(true);
      }

      if (secDuration > 0) {
        if (!this.useRedisPackage && !this.useRedis3AndLowerPackage) {
          return this.client.rlflxIncr(
            [rlKey].concat([
              String(points),
              String(secDuration),
              String(this.points),
              String(this.duration),
            ])
          );
        }
        if (this.useRedis3AndLowerPackage) {
          return new Promise((resolve, reject) => {
            const incrCallback = function (err, result) {
              if (err) {
                return reject(err);
              }

              return resolve(result);
            };

            if (typeof this.client.rlflxIncr === "function") {
              this.client.rlflxIncr(
                rlKey,
                points,
                secDuration,
                this.points,
                this.duration,
                incrCallback
              );
            } else {
              this.client.eval(
                this._incrTtlLuaScript,
                1,
                rlKey,
                points,
                secDuration,
                this.points,
                this.duration,
                incrCallback
              );
            }
          });
        } else {
          return this.client.eval(this._incrTtlLuaScript, {
            keys: [rlKey],
            arguments: [
              String(points),
              String(secDuration),
              String(this.points),
              String(this.duration),
            ],
          });
        }
      } else {
        if (!this.useRedisPackage && !this.useRedis3AndLowerPackage) {
          return multi.incrby(rlKey, points).pttl(rlKey).exec(true);
        }

        return multi.incrBy(rlKey, points).pTTL(rlKey).exec(true);
      }
    } catch (err) {
      isUpsertSuccessful = false;
      this._incrementUpdateTriesFailures(err);
      console.error("Error in _upsertAndUpdateUpsertAttempts:", err);
      throw err; 
    } finally {
      console.log("Update result for values:", isUpsertSuccessful, rlKey, points, msDuration);
      if (isUpsertSuccessful) {
        this._resetUpdateTriesFailures();
      }
    }
  }

  async _get(rlKey) {
    if (!this._isRedisReady()) {
      throw new Error("Redis connection is not ready");
    }
    if (!this.useRedisPackage && !this.useRedis3AndLowerPackage) {
      return this.client
        .multi()
        .get(rlKey)
        .pttl(rlKey)
        .exec()
        .then((result) => {
          const [[, points]] = result;
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
    return this.client.del(rlKey).then((result) => result > 0);
  }

  /** Upsert gets the key and returns the current points and ttl as if the points were consumed.
   *  It also triggers an async upsertAndUpdateUpsertAttempts to update the points in redis.
   *  This method is not atomic, hence it does not guarantee that the points returned are the actual points after consumption.
   *  It is possible that multiple calls to upsert for the same key may return the same points if the redis update is not yet completed.
   *  This method is useful in scenarios where you want to allow concurrency and are okay with potential over-consumption of points till the read values are synced by redis.
   * @param  rlKey - redis key
   * @param  points  - points to consume
   * @param  msDuration - duration the key should exist in ms
   * @param  forceExpire - whether to force set the expire time to msDuration
   * @param  options - additional options
   * @returns 
   */
  async _upsert(rlKey, points, msDuration, forceExpire = false, options = {}) {
    return new Promise((resolve, reject) => {
      // Log the consume call for debugging
      console.log("\n\_upsert called with", rlKey, points, msDuration, options);

      // if isUpdateTriesFailuresLimitReached already, call handleError
      // this would let the user handle the error in a custom way -- call the insuranceLimiter or throw an error etc
      if (this._isUpdateTriesFailuresLimitReached()) {
        // Log the error for debugging
        console.error(
          "Update tries failures limit reached for key",
          rlKey,
          "with pointsToConsume",
          points,
          "and options",
          options
        );
        this._handleError(
          this._updateTriesFailureError,
          "consume",
          resolve,
          reject,
          key,
          points,
          options
        );
        return;
      }

      // get and consume points
      this._get(rlKey)
        .then((result) => {
          // Log the result for debugging
          console.log("got result for key", rlKey, ":", result);
          if (result === null) {
            console.log(`Key does not exist, max points ${this.points}, points that need to be consumed ${points} and ttl ${msDuration} ms`);
            // If the key does not exist, set the initial points and ttl
            result = [0, this.duration];
          } else {
            let [currentConsumedPoints, currentTtl] = result;
            // Support ioredis results format
            if (Array.isArray(currentConsumedPoints)) {
              [, currentConsumedPoints] = currentConsumedPoints;
              [, currentTtl] = currentTtl;
            }
            console.log(`currentConsumedPoints: ${currentConsumedPoints}, currentTtl: ${currentTtl} ms`);
            result = [parseInt(currentConsumedPoints, 10), currentTtl];

            if (currentTtl <= -1) {
              // If the key exists but has no ttl, set the ttl to msDuration
              console.log(`Key exists but has no ttl, setting result to intial points ${this.points} and ttl ${msDuration} ms`);
              result = [0, this.duration];
            }
          }

          console.log("_upsert -> calling _upsertAndUpdateUpsertAttempts with", rlKey, points, msDuration, forceExpire);

          
          // validate before calling upsert
          this._validateUpsert(rlKey, points, msDuration, forceExpire);
          // Call upsertAndUpdateUpsertAttempts but don't wait for it to complete
          this._upsertAndUpdateUpsertAttempts(
            rlKey,
            points, // points to increment
            msDuration, // ttl to set
            forceExpire,
            true // skip validation as already done
          ).catch((err) => {
          // Optionally log the error
            console.error('Async _upsert error:', err);
          });

          // msDuration is only used if msDuration > currentTtl
          result = [result[0] + parseInt(points, 10), msDuration > result[1] ? msDuration : result[1] ];
          console.log("result after upsert:", result);
          return resolve(result);
        })
        .catch((err) => {
          return reject(err);
        });
    });
  }
}

module.exports = RateLimiterRedisNonAtomic;
