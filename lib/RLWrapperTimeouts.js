const RateLimiterAbstract = require('./RateLimiterAbstract');
const RateLimiterInsuredAbstract = require('./RateLimiterInsuredAbstract');

module.exports = class RLWrapperTimeouts extends RateLimiterInsuredAbstract {
  constructor(opts= {}) {
    super(opts);
    this.limiter = opts.limiter;
    this.timeoutMs = opts.timeoutMs || 0;
  }

  get limiter() {
    return this._limiter;
  }

  set limiter(limiter) {
    if (!(limiter instanceof RateLimiterAbstract)) {
      throw new TypeError('limiter must be an instance of RateLimiterAbstract');
    }
    this._limiter = limiter;
    if (!this.insuranceLimiter && limiter instanceof RateLimiterInsuredAbstract) {
      this.insuranceLimiter = limiter.insuranceLimiter;
    }
  }

  get timeoutMs() {
    return this._timeoutMs;
  }

  set timeoutMs(value) {
    if (typeof value !== 'number' || value < 0) {
      throw new TypeError('timeoutMs must be a non-negative number');
    }
    this._timeoutMs = value;
  }

  _run(funcName, params) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        return reject(new Error('Operation timed out'));
      }, this.timeoutMs);

      await this.limiter[funcName](...params)
        .then((result) => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timeout);
          reject(err);
        });
    });
  }

  _consume(key, pointsToConsume = 1, options = {}) {
    return this._run('consume', [key, pointsToConsume, options]);
  }

  _penalty(key, points = 1, options = {}) {
    return this._run('penalty', [key, points, options]);
  }

  _reward(key, points = 1, options = {}) {
    return this._run('reward', [key, points, options]);
  }

  _get(key, options = {}) {
    return this._run('get', [key, options]);
  }

  _set(key, points, secDuration, options = {}) {
    return this._run('set', [key, points, secDuration, options]);
  }

  _block(key, secDuration, options = {}) {
    return this._run('block', [key, secDuration, options]);
  }

  _delete(key, options = {}) {
    return this._run('delete', [key, options]);
  }

}
