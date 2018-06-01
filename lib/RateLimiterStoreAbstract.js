const RateLimiterAbstract = require('./RateLimiterAbstract');
const BlockedKeys = require('./component/BlockedKeys');

module.exports = class RateLimiterStoreAbstract extends RateLimiterAbstract {
  /**
   *
   * @param opts Object Defaults {
   *   ... see other in RateLimiterAbstract
   *
   *   blockOnPointsConsumed: 40, // Number of points when key is blocked
   *   blockDuration: 10, // Block duration in seconds
   *   insuranceLimiter: RateLimiterAbstract
   * }
   */
  constructor(opts = {}) {
    super(opts);

    this.blockOnPointsConsumed = opts.blockOnPointsConsumed;
    this.blockDuration = opts.blockDuration;
    this.insuranceLimiter = opts.insuranceLimiter;
    this._blockedKeys = new BlockedKeys();
  }

  getBlockMsBeforeExpire(rlKey) {
    if (this.blockOnPointsConsumed > 0) {
      return this._blockedKeys.msBeforeExpire(rlKey);
    }

    return 0;
  }

  handleError(err, funcName, resolve, reject, key, points) {
    if (!(this.insuranceLimiter instanceof RateLimiterAbstract)) {
      reject(err);
    } else {
      this.insuranceLimiter[funcName](key, points)
        .then((res) => {
          resolve(res);
        })
        .catch((res) => {
          reject(res);
        });
    }
  }

  get blockOnPointsConsumed() {
    return this._blockOnPointsConsumed;
  }

  set blockOnPointsConsumed(value) {
    this._blockOnPointsConsumed = value ? parseInt(value) : 0;
    if (this.blockOnPointsConsumed > 0 && this.points >= this.blockOnPointsConsumed) {
      throw new Error('blockOnPointsConsumed option must be more than points option');
    }
  }

  get blockDuration() {
    return this._blockDuration;
  }

  get msBlockDuration() {
    return this._blockDuration * 1000;
  }

  set blockDuration(value) {
    this._blockDuration = value ? parseInt(value) : 0;
    if (this.blockDuration > 0 && this.blockOnPointsConsumed === 0) {
      throw new Error('blockOnPointsConsumed option must be set up');
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
  }
};
