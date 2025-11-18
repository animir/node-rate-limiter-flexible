const RateLimiterAbstract = require('./RateLimiterAbstract');
const RateLimiterRes = require('./RateLimiterRes');

module.exports = class RateLimiterInsuredAbstract extends RateLimiterAbstract {
  constructor(opts = {}) {
    super(opts);
    this.insuranceLimiter = opts.insuranceLimiter;
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

  _handleError(err, funcName, resolve, reject, params) {
    if (err instanceof RateLimiterRes) {
      reject(err);
    } else if (!(this.insuranceLimiter instanceof RateLimiterAbstract)) {
      reject(err);
    } else {
      this.insuranceLimiter[funcName](...params)
        .then((res) => {
          resolve(res);
        })
        .catch((res) => {
          reject(res);
        });
    }
  }

  _operation(funcName, params) {
    const promise = this[funcName](...params);
    return new Promise((resolve, reject) => {
      return promise.then((res) => {
          resolve(res);
        })
        .catch((err) => {
          if (funcName.startsWith('_')) {
            funcName = funcName.slice(1);
          }
          this._handleError(err, funcName, resolve, reject, params);
        });
    });
  }

  consume(key, pointsToConsume = 1, options = {}) {
    return this._operation('_consume', [key, pointsToConsume, options]);
  }

  penalty(key, points = 1, options = {}) {
    return this._operation('_penalty', [key, points, options]);
  }

  reward(key, points = 1, options = {}) {
    return this._operation('_reward', [key, points, options]);
  }

  get(key, options = {}) {
    return this._operation('_get', [key, options]);
  }

  set(key, points, secDuration, options = {}) {
    return this._operation('_set', [key, points, secDuration, options]);
  }

  block(key, secDuration, options = {}) {
    return this._operation('_block', [key, secDuration, options]);
  }

  delete(key, options = {}) {
    return this._operation('_delete', [key, options]);
  }

  _consume() {
    throw new Error("You have to implement the method '_consume'!");
  }

  _penalty() {
    throw new Error("You have to implement the method '_penalty'!");
  }

  _reward() {
    throw new Error("You have to implement the method '_reward'!");
  }

  _get() {
    throw new Error("You have to implement the method '_get'!");
  }

  _set() {
    throw new Error("You have to implement the method '_set'!");
  }

  _block() {
    throw new Error("You have to implement the method '_block'!");
  }

  _delete() {
    throw new Error("You have to implement the method '_delete'!");
  }

}
