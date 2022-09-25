const RateLimiterAbstract = require('./RateLimiterAbstract');
const BlockedKeys = require('./component/BlockedKeys');
const RateLimiterRes = require('./RateLimiterRes');

module.exports = class RateLimiterStoreAbstract extends RateLimiterAbstract {
  /**
   *
   * @param opts Object Defaults {
   *   ... see other in RateLimiterAbstract
   *
   *   inMemoryBlockOnConsumed: 40, // Number of points when key is blocked
   *   inMemoryBlockDuration: 10, // Block duration in seconds
   *   insuranceLimiter: RateLimiterAbstract
   * }
   */
  constructor(opts = {}) {
    super(opts);

    this.inMemoryBlockOnConsumed = opts.inMemoryBlockOnConsumed || opts.inmemoryBlockOnConsumed;
    this.inMemoryBlockDuration = opts.inMemoryBlockDuration || opts.inmemoryBlockDuration;
    this.insuranceLimiter = opts.insuranceLimiter;
    this._inMemoryBlockedKeys = new BlockedKeys();
  }

  get client() {
    return this._client;
  }

  set client(value) {
    if (typeof value === 'undefined') {
      throw new Error('storeClient is not set');
    }
    this._client = value;
  }

  /**
   * Have to be launched after consume
   * It blocks key and execute evenly depending on result from store
   *
   * It uses _getRateLimiterRes function to prepare RateLimiterRes from store result
   *
   * @param resolve
   * @param reject
   * @param rlKey
   * @param changedPoints
   * @param storeResult
   * @param {Object} options
   * @private
   */
  _afterConsume(resolve, reject, rlKey, changedPoints, storeResult, options = {}) {
    const res = this._getRateLimiterRes(rlKey, changedPoints, storeResult);

    if (this.inMemoryBlockOnConsumed > 0 && !(this.inMemoryBlockDuration > 0)
      && res.consumedPoints >= this.inMemoryBlockOnConsumed
    ) {
      this._inMemoryBlockedKeys.addMs(rlKey, res.msBeforeNext);
      if (res.consumedPoints > this.points) {
        return reject(res);
      } else {
        return resolve(res)
      }
    } else if (res.consumedPoints > this.points) {
      let blockPromise = Promise.resolve();
      // Block only first time when consumed more than points
      if (this.blockDuration > 0 && res.consumedPoints <= (this.points + changedPoints)) {
        res.msBeforeNext = this.msBlockDuration;
        blockPromise = this._block(rlKey, res.consumedPoints, this.msBlockDuration, options);
      }

      if (this.inMemoryBlockOnConsumed > 0 && res.consumedPoints >= this.inMemoryBlockOnConsumed) {
        // Block key for this.inMemoryBlockDuration seconds
        this._inMemoryBlockedKeys.add(rlKey, this.inMemoryBlockDuration);
        res.msBeforeNext = this.msInMemoryBlockDuration;
      }

      blockPromise
        .then(() => {
          reject(res);
        })
        .catch((err) => {
          reject(err);
        });
    } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
      let delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
      if (delay < this.execEvenlyMinDelayMs) {
        delay = res.consumedPoints * this.execEvenlyMinDelayMs;
      }

      setTimeout(resolve, delay, res);
    } else {
      resolve(res);
    }
  }

  _handleError(err, funcName, resolve, reject, key, data = false, options = {}) {
    if (!(this.insuranceLimiter instanceof RateLimiterAbstract)) {
      reject(err);
    } else {
      this.insuranceLimiter[funcName](key, data, options)
        .then((res) => {
          resolve(res);
        })
        .catch((res) => {
          reject(res);
        });
    }
  }

  /**
   * @deprecated Use camelCase version
   * @returns {BlockedKeys}
   * @private
   */
  get _inmemoryBlockedKeys() {
    return this._inMemoryBlockedKeys
  }

  /**
   * @deprecated Use camelCase version
   * @param rlKey
   * @returns {number}
   */
  getInmemoryBlockMsBeforeExpire(rlKey) {
    return this.getInMemoryBlockMsBeforeExpire(rlKey)
  }

  /**
   * @deprecated Use camelCase version
   * @returns {number|number}
   */
  get inmemoryBlockOnConsumed() {
    return this.inMemoryBlockOnConsumed;
  }

  /**
   * @deprecated Use camelCase version
   * @param value
   */
  set inmemoryBlockOnConsumed(value) {
    this.inMemoryBlockOnConsumed = value;
  }

  /**
   * @deprecated Use camelCase version
   * @returns {number|number}
   */
  get inmemoryBlockDuration() {
    return this.inMemoryBlockDuration;
  }

  /**
   * @deprecated Use camelCase version
   * @param value
   */
  set inmemoryBlockDuration(value) {
    this.inMemoryBlockDuration = value
  }

  /**
   * @deprecated Use camelCase version
   * @returns {number}
   */
  get msInmemoryBlockDuration() {
    return this.inMemoryBlockDuration * 1000;
  }

  getInMemoryBlockMsBeforeExpire(rlKey) {
    if (this.inMemoryBlockOnConsumed > 0) {
      return this._inMemoryBlockedKeys.msBeforeExpire(rlKey);
    }

    return 0;
  }

  get inMemoryBlockOnConsumed() {
    return this._inMemoryBlockOnConsumed;
  }

  set inMemoryBlockOnConsumed(value) {
    this._inMemoryBlockOnConsumed = value ? parseInt(value) : 0;
    if (this.inMemoryBlockOnConsumed > 0 && this.points > this.inMemoryBlockOnConsumed) {
      throw new Error('inMemoryBlockOnConsumed option must be greater or equal "points" option');
    }
  }

  get inMemoryBlockDuration() {
    return this._inMemoryBlockDuration;
  }

  set inMemoryBlockDuration(value) {
    this._inMemoryBlockDuration = value ? parseInt(value) : 0;
    if (this.inMemoryBlockDuration > 0 && this.inMemoryBlockOnConsumed === 0) {
      throw new Error('inMemoryBlockOnConsumed option must be set up');
    }
  }

  get msInMemoryBlockDuration() {
    return this._inMemoryBlockDuration * 1000;
  }

  get insuranceLimiter() {
    return this._insuranceLimiter;
  }

  set insuranceLimiter(value) {
    if (typeof value !== 'undefined' && !(value instanceof RateLimiterAbstract)) {
      throw new Error('insuranceLimiter must be instance of RateLimiterAbstract');
    }
    this._insuranceLimiter = value;
    if (this._insuranceLimiter) {
      this._insuranceLimiter.blockDuration = this.blockDuration;
      this._insuranceLimiter.execEvenly = this.execEvenly;
    }
  }

  /**
   * Block any key for secDuration seconds
   *
   * @param key
   * @param secDuration
   * @param {Object} options
   *
   * @return Promise<RateLimiterRes>
   */
  block(key, secDuration, options = {}) {
    const msDuration = secDuration * 1000;
    return this._block(this.getKey(key), this.points + 1, msDuration, options);
  }

  /**
   * Set points by key for any duration
   *
   * @param key
   * @param points
   * @param secDuration
   * @param {Object} options
   *
   * @return Promise<RateLimiterRes>
   */
  set(key, points, secDuration, options = {}) {
    const msDuration = (secDuration >= 0 ? secDuration : this.duration) * 1000;
    return this._block(this.getKey(key), points, msDuration, options);
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @param {Object} options
   * @returns Promise<RateLimiterRes>
   */
  consume(key, pointsToConsume = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);

      const inMemoryBlockMsBeforeExpire = this.getInMemoryBlockMsBeforeExpire(rlKey);
      if (inMemoryBlockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, inMemoryBlockMsBeforeExpire));
      }

      this._upsert(rlKey, pointsToConsume, this._getKeySecDuration(options) * 1000, false, options)
        .then((res) => {
          this._afterConsume(resolve, reject, rlKey, pointsToConsume, res);
        })
        .catch((err) => {
          this._handleError(err, 'consume', resolve, reject, key, pointsToConsume, options);
        });
    });
  }

  /**
   *
   * @param key
   * @param points
   * @param {Object} options
   * @returns Promise<RateLimiterRes>
   */
  penalty(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, points, this._getKeySecDuration(options) * 1000, false, options)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, points, res));
        })
        .catch((err) => {
          this._handleError(err, 'penalty', resolve, reject, key, points, options);
        });
    });
  }

  /**
   *
   * @param key
   * @param points
   * @param {Object} options
   * @returns Promise<RateLimiterRes>
   */
  reward(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, -points, this._getKeySecDuration(options) * 1000, false, options)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, -points, res));
        })
        .catch((err) => {
          this._handleError(err, 'reward', resolve, reject, key, points, options);
        });
    });
  }

  /**
   *
   * @param key
   * @param {Object} options
   * @returns Promise<RateLimiterRes>|null
   */
  get(key, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._get(rlKey, options)
        .then((res) => {
          if (res === null || typeof res === 'undefined') {
            resolve(null);
          } else {
            resolve(this._getRateLimiterRes(rlKey, 0, res));
          }
        })
        .catch((err) => {
          this._handleError(err, 'get', resolve, reject, key, options);
        });
    });
  }

  /**
   *
   * @param key
   * @param {Object} options
   * @returns Promise<boolean>
   */
  delete(key, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._delete(rlKey, options)
        .then((res) => {
          this._inMemoryBlockedKeys.delete(rlKey);
          resolve(res);
        })
        .catch((err) => {
          this._handleError(err, 'delete', resolve, reject, key, options);
        });
    });
  }

  /**
   * Cleanup keys no-matter expired or not.
   */
  deleteInMemoryBlockedAll() {
    this._inMemoryBlockedKeys.delete();
  }

  /**
   * Get RateLimiterRes object filled depending on storeResult, which specific for exact store
   *
   * @param rlKey
   * @param changedPoints
   * @param storeResult
   * @private
   */
  _getRateLimiterRes(rlKey, changedPoints, storeResult) { // eslint-disable-line no-unused-vars
    throw new Error("You have to implement the method '_getRateLimiterRes'!");
  }

  /**
   * Block key for this.msBlockDuration milliseconds
   * Usually, it just prolongs lifetime of key
   *
   * @param rlKey
   * @param initPoints
   * @param msDuration
   * @param {Object} options
   *
   * @return Promise<any>
   */
  _block(rlKey, initPoints, msDuration, options = {}) {
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, initPoints, msDuration, true, options)
        .then(() => {
          resolve(new RateLimiterRes(0, msDuration > 0 ? msDuration : -1, initPoints));
        })
        .catch((err) => {
          this._handleError(err, 'block', resolve, reject, this.parseKey(rlKey), msDuration / 1000, options);
        });
    });
  }

  /**
   * Have to be implemented in every limiter
   * Resolve with raw result from Store OR null if rlKey is not set
   * or Reject with error
   *
   * @param rlKey
   * @param {Object} options
   * @private
   *
   * @return Promise<any>
   */
  _get(rlKey, options = {}) { // eslint-disable-line no-unused-vars
    throw new Error("You have to implement the method '_get'!");
  }

  /**
   * Have to be implemented
   * Resolve with true OR false if rlKey doesn't exist
   * or Reject with error
   *
   * @param rlKey
   * @param {Object} options
   * @private
   *
   * @return Promise<any>
   */
  _delete(rlKey, options = {}) { // eslint-disable-line no-unused-vars
    throw new Error("You have to implement the method '_delete'!");
  }

  /**
   * Have to be implemented
   * Resolve with object used for {@link _getRateLimiterRes} to generate {@link RateLimiterRes}
   *
   * @param {string} rlKey
   * @param {number} points
   * @param {number} msDuration
   * @param {boolean} forceExpire
   * @param {Object} options
   * @abstract
   *
   * @return Promise<Object>
   */
  _upsert(rlKey, points, msDuration, forceExpire = false, options = {}) {
    throw new Error("You have to implement the method '_upsert'!");
  }
};
