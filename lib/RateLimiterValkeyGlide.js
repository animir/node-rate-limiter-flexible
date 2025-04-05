/* eslint-disable no-unused-vars */
const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

/**
 * @typedef {import('@valkey/valkey-glide').GlideClient} GlideClient
 * @typedef {import('@valkey/valkey-glide').GlideClusterClient} GlideClusterClient
 */

const DEFAULT_LIBRARY_NAME = 'ratelimiterflexible';

const DEFAULT_VALKEY_SCRIPT = `local key = KEYS[1]
local pointsToConsume = tonumber(ARGV[1])
if tonumber(ARGV[2]) > 0 then
  server.call('set', key, "0", 'EX', ARGV[2], 'NX')
  local consumed = server.call('incrby', key, pointsToConsume)
  local pttl = server.call('pttl', key)
  return {consumed, pttl}
end
local consumed = server.call('incrby', key, pointsToConsume)
local pttl = server.call('pttl', key)
return {consumed, pttl}`;

const GET_VALKEY_SCRIPT = `local key = KEYS[1]
local value = server.call('get', key)
if value == nil then
  return value
end
local pttl = server.call('pttl', key)
return {tonumber(value), pttl}`;

class RateLimiterValkeyGlide extends RateLimiterStoreAbstract {
  /**
   * Constructor for RateLimiterValkeyGlide
   *
   * @param {Object} opts - Configuration options
   * @param {GlideClient|GlideClusterClient} opts.storeClient - Valkey Glide client instance (required)
   * @param {number} [opts.points=4] - Maximum number of points that can be consumed over duration
   * @param {number} [opts.duration=1] - Duration in seconds before points are reset
   * @param {number} [opts.blockDuration=0] - Duration in seconds that a key will be blocked for if consumed more than points
   * @param {boolean} [opts.rejectIfValkeyNotReady=false] - Whether to reject requests if Valkey is not ready
   * @param {boolean} [opts.execEvenly=false] - Delay actions to distribute them evenly over duration
   * @param {number} [opts.execEvenlyMinDelayMs] - Minimum delay between actions when execEvenly is true
   * @param {string} [opts.customFunction] - Custom Lua script for rate limiting logic
   * @param {number} [opts.inMemoryBlockOnConsumed] - Points threshold for in-memory blocking
   * @param {number} [opts.inMemoryBlockDuration] - Duration in seconds for in-memory blocking
   * @param {string} [opts.customFunctionLibName] - Custom name for the function library, defaults to 'ratelimiter'.
   * The name is used to identify the library of the lua function. An custom name should be used only if you
   * you want to use different libraries for different rate limiters, otherwise it is not needed.
   * @param {RateLimiterAbstract} [opts.insuranceLimiter] - Backup limiter to use when the primary client fails
   *
   * @example
   * const rateLimiter = new RateLimiterValkeyGlide({
   *   storeClient: glideClient,
   *   points: 5,
   *   duration: 1
   * });
   *
   * @example <caption>With custom Lua function</caption>
   * const customScript = `local key = KEYS[1]
   * local pointsToConsume = tonumber(ARGV[1]) or 0
   * local secDuration = tonumber(ARGV[2]) or 0
   *
   * -- Custom implementation
   * -- ...
   *
   * -- Must return exactly two values: [consumed_points, ttl_in_ms]
   * return {consumed, ttl}`
   *
   * const rateLimiter = new RateLimiterValkeyGlide({
   *   storeClient: glideClient,
   *   points: 5,
   *   customFunction: customScript
   * });
   *
   * @example <caption>With insurance limiter</caption>
   * const rateLimiter = new RateLimiterValkeyGlide({
   *   storeClient: primaryGlideClient,
   *   points: 5,
   *   duration: 2,
   *   insuranceLimiter: new RateLimiterMemory({
   *     points: 5,
   *     duration: 2
   *   })
   * });
   *
   * @description
   * When providing a custom Lua script via `opts.customFunction`, it must:
   *
   * 1. Accept parameters:
   *    - KEYS[1]: The key being rate limited
   *    - ARGV[1]: Points to consume (as string, use tonumber() to convert)
   *    - ARGV[2]: Duration in seconds (as string, use tonumber() to convert)
   *
   * 2. Return an array with exactly two elements:
   *    - [0]: Consumed points (number)
   *    - [1]: TTL in milliseconds (number)
   *
   * 3. Handle scenarios:
   *    - New key creation: Initialize with expiry for fixed windows
   *    - Key updates: Increment existing counters
   */
  constructor(opts) {
    super(opts);
    this.client = opts.storeClient;
    this._scriptLoaded = false;
    this._getScriptLoaded = false;
    this._rejectIfValkeyNotReady = !!opts.rejectIfValkeyNotReady;
    this._luaScript = opts.customFunction || DEFAULT_VALKEY_SCRIPT;
    this._libraryName = opts.customFunctionLibName || DEFAULT_LIBRARY_NAME;
  }

  /**
   * Ensure scripts are loaded in the Valkey server
   * @returns {Promise<boolean>} True if scripts are loaded
   * @private
   */
  async _loadScripts() {
    if (this._scriptLoaded && this._getScriptLoaded) {
      return true;
    }
    if (!this.client) {
      throw new Error('Valkey client is not set');
    }
    const promises = [];
    if (!this._scriptLoaded) {
      const script = Buffer.from(`#!lua name=${this._libraryName}
        local function consume(KEYS, ARGV)
          ${this._luaScript.trim()}
        end
        server.register_function('consume', consume)`);
      promises.push(this.client.functionLoad(script, { replace: true }));
    } else promises.push(Promise.resolve(this._libraryName));

    if (!this._getScriptLoaded) {
      const script = Buffer.from(`#!lua name=ratelimiter_get
        local function getValue(KEYS, ARGV)
          ${GET_VALKEY_SCRIPT.trim()}
        end
        server.register_function('getValue', getValue)`);
      promises.push(this.client.functionLoad(script, { replace: true }));
    } else promises.push(Promise.resolve('ratelimiter_get'));

    const results = await Promise.all(promises);
    this._scriptLoaded = results[0] === this._libraryName;
    this._getScriptLoaded = results[1] === 'ratelimiter_get';

    if ((!this._scriptLoaded || !this._getScriptLoaded)) {
      throw new Error('Valkey connection is not ready, scripts not loaded');
    }
    return true;
  }

  /**
   * Update or insert the rate limiter record
   *
   * @param {string} rlKey - The rate limiter key
   * @param {number} pointsToConsume - Points to be consumed
   * @param {number} msDuration - Duration in milliseconds
   * @param {boolean} [forceExpire=false] - Whether to force expiration
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<Array>} Array containing consumed points and TTL
   * @private
   */
  async _upsert(rlKey, pointsToConsume, msDuration, forceExpire = false, options = {}) {
    await this._loadScripts();
    const secDuration = Math.floor(msDuration / 1000);
    if (forceExpire) {
      if (secDuration > 0) {
        await this.client.set(
          rlKey,
          String(pointsToConsume),
          { expiry: { type: 'EX', count: secDuration } },
        );
        return [pointsToConsume, secDuration * 1000];
      }
      await this.client.set(rlKey, String(pointsToConsume));
      return [pointsToConsume, -1];
    }
    const result = await this.client.fcall(
      'consume',
      [rlKey],
      [String(pointsToConsume), String(secDuration)],
    );
    return result;
  }

  /**
   * Get the rate limiter record
   *
   * @param {string} rlKey - The rate limiter key
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<Array|null>} Array containing consumed points and TTL, or null if not found
   * @private
   */
  async _get(rlKey, options = {}) {
    await this._loadScripts();
    const res = await this.client.fcall('getValue', [rlKey], []);
    return res.length > 0 ? res : null;
  }

  /**
   * Delete the rate limiter record
   *
   * @param {string} rlKey - The rate limiter key
   * @param {Object} [options={}] - Additional options
   * @returns {Promise<boolean>} True if successful, false otherwise
   * @private
   */
  async _delete(rlKey, options = {}) {
    const result = await this.client.del([rlKey]);
    return result > 0;
  }

  /**
   * Convert raw result to RateLimiterRes object
   *
   * @param {string} rlKey - The rate limiter key
   * @param {number} changedPoints - Points changed in this operation
   * @param {Array|null} result - Result from Valkey operation
   * @returns {RateLimiterRes|null} RateLimiterRes object or null if result is null
   * @private
   */
  _getRateLimiterRes(rlKey, changedPoints, result) {
    if (result === null) {
      return null;
    }
    const res = new RateLimiterRes();
    const [consumedPointsStr, pttl] = result;
    const consumedPoints = Number(consumedPointsStr);

    // Handle consumed points
    res.isFirstInDuration = consumedPoints === changedPoints;
    res.consumedPoints = consumedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = pttl;
    return res;
  }

  /**
   * Close the rate limiter and release resources
   * Note: The method won't going to close the Valkey client, as it may be shared with other instances.
   * @returns {Promise<void>} Promise that resolves when the rate limiter is closed
   */
  async close() {
    if (this._scriptLoaded) {
      await this.client.functionDelete(this._libraryName);
      this._scriptLoaded = false;
    }
    if (this._getScriptLoaded) {
      await this.client.functionDelete('ratelimiter_get');
      this._getScriptLoaded = false;
    }
    if (this.insuranceLimiter) {
      try {
        await this.insuranceLimiter.close();
      } catch (e) {
        // We can't assume that insuranceLimiter is a Valkey client or any
        // other insuranceLimiter type which implement close method.
      }
    }
    // Clear instance properties to let garbage collector free memory
    this.client = null;
    this._scriptLoaded = false;
    this._getScriptLoaded = false;
    this._rejectIfValkeyNotReady = false;
    this._luaScript = null;
    this._libraryName = null;
    this.insuranceLimiter = null;
  }
}

module.exports = RateLimiterValkeyGlide;
