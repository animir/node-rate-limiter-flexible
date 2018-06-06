const RateLimiterAbstract = require('./RateLimiterAbstract');
const BlockedKeys = require('./component/BlockedKeys');

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
    this._blockedKeys = new BlockedKeys();
  }

  getBlockMsBeforeExpire(rlKey) {
    if (this.inmemoryBlockOnConsumed > 0) {
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

  get msBlockDuration() {
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
  }
};
