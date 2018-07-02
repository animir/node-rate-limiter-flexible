const RateLimiterAbstract = require('./RateLimiterAbstract');
const BlockedKeys = require('./component/BlockedKeys');
const RateLimiterRes = require('./RateLimiterRes');

module.exports = class RateLimiterStoreAbstract extends RateLimiterAbstract {
  /**
   *
   * @param opts Object Defaults {
   *   ... see other in RateLimiterAbstract
   *
   *   inmemoryBlockOnConsumed: 40, // Number of points when key is blocked
   *   inmemoryBlockDuration: 10, // Block duration in seconds
   *   insuranceLimiter: RateLimiterAbstract
   * }
   */
  constructor(opts = {}) {
    super(opts);

    this.inmemoryBlockOnConsumed = opts.inmemoryBlockOnConsumed;
    this.inmemoryBlockDuration = opts.inmemoryBlockDuration;
    this.insuranceLimiter = opts.insuranceLimiter;
    this._inmemoryBlockedKeys = new BlockedKeys();
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
   * @private
   */
  _afterConsume(resolve, reject, rlKey, changedPoints, storeResult) {
    const res = this._getRateLimiterRes(rlKey, changedPoints, storeResult);

    if (res.consumedPoints > this.points) {
      if (this.inmemoryBlockOnConsumed > 0 && res.consumedPoints >= this.inmemoryBlockOnConsumed) {
        // Block key for this.inmemoryBlockDuration seconds
        this._inmemoryBlockedKeys.add(rlKey, this.inmemoryBlockDuration);
        res.msBeforeNext = this.msInmemoryBlockDuration;

        reject(res);
        // Block only first time when consumed more than points
      } else if (this.blockDuration > 0 && res.consumedPoints <= (this.points + changedPoints)) {
        this._block(rlKey, res.consumedPoints, this.msBlockDuration)
          .then(() => {
            res.msBeforeNext = this.msBlockDuration;
            reject(res);
          })
          .catch((err) => {
            reject(err);
          });
      } else {
        reject(res);
      }
    } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
      const delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));

      setTimeout(resolve, delay, res);
    } else {
      resolve(res);
    }
  }

  _handleError(err, funcName, resolve, reject, key, data = false) {
    if (!(this.insuranceLimiter instanceof RateLimiterAbstract)) {
      reject(err);
    } else {
      this.insuranceLimiter[funcName](key, data)
        .then((res) => {
          resolve(res);
        })
        .catch((res) => {
          reject(res);
        });
    }
  }

  getInmemoryBlockMsBeforeExpire(rlKey) {
    if (this.inmemoryBlockOnConsumed > 0) {
      return this._inmemoryBlockedKeys.msBeforeExpire(rlKey);
    }

    return 0;
  }

  get inmemoryBlockOnConsumed() {
    return this._inmemoryBlockOnConsumed;
  }

  set inmemoryBlockOnConsumed(value) {
    this._inmemoryBlockOnConsumed = value ? parseInt(value) : 0;
    if (this.inmemoryBlockOnConsumed > 0 && this.points > this.inmemoryBlockOnConsumed) {
      throw new Error('inmemoryBlockOnConsumed option must be greater or equal "points" option');
    }
  }

  get inmemoryBlockDuration() {
    return this._inmemoryBlockDuration;
  }

  get msInmemoryBlockDuration() {
    return this._inmemoryBlockDuration * 1000;
  }

  set inmemoryBlockDuration(value) {
    this._inmemoryBlockDuration = value ? parseInt(value) : 0;
    if (this.inmemoryBlockDuration > 0 && this.inmemoryBlockOnConsumed === 0) {
      throw new Error('inmemoryBlockOnConsumed option must be set up');
    }
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
   *
   * @return Promise<any>
   */
  block(key, secDuration) {
    const msDuration = secDuration * 1000;
    return this._block(this.getKey(key), this.points + 1, msDuration);
  }

  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);

      const inmemoryBlockMsBeforeExpire = this.getInmemoryBlockMsBeforeExpire(rlKey);
      if (inmemoryBlockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, inmemoryBlockMsBeforeExpire));
      }

      this._upsert(rlKey, pointsToConsume, this.msDuration)
        .then((res) => {
          this._afterConsume(resolve, reject, rlKey, pointsToConsume, res);
        })
        .catch((err) => {
          this._handleError(err, 'consume', resolve, reject, key, pointsToConsume);
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, points, this.msDuration)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, points, res));
        })
        .catch((err) => {
          this._handleError(err, 'penalty', resolve, reject, key, points);
        });
    });
  }

  reward(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, -points, this.msDuration)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, -points, res));
        })
        .catch((err) => {
          this._handleError(err, 'reward', resolve, reject, key, -points);
        });
    });
  }

  get(key) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      this._get(rlKey)
        .then((res) => {
          if (res === null) {
            resolve(res);
          } else {
            resolve(this._getRateLimiterRes(rlKey, 0, res));
          }
        })
        .catch((err) => {
          this._handleError(err, 'get', resolve, reject, key);
        });
    });
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
   *
   * @return Promise<any>
   */
  _block(rlKey, initPoints, msDuration) {
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, initPoints, msDuration, true)
        .then(() => {
          resolve(new RateLimiterRes(0, msDuration, initPoints));
        })
        .catch((err) => {
          this._handleError(err, 'block', resolve, reject, this.parseKey(rlKey), msDuration / 1000);
        });
    });
  }

  /**
   * Have to be implemented in every limiter
   * Resolve with raw result from Store OR null if rlKey is not set
   * or Reject with error
   *
   * @param rlKey
   * @private
   *
   * @return Promise<any>
   */
  _get(rlKey) { // eslint-disable-line no-unused-vars
    throw new Error("You have to implement the method '_get'!");
  }
};
