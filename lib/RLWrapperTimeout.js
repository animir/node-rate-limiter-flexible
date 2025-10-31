const RateLimiterAbstract = require('./RateLimiterAbstract');
const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterInsuredAbstract = require('./RateLimiterInsuredAbstract');

module.exports = class RLWrapperTimeout extends RateLimiterInsuredAbstract {
  constructor(opts= {}) {
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
    if (!this.insuranceLimiter && limiter instanceof RateLimiterStoreAbstract) {
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

  consume(key, pointsToConsume = 1, options = {}) {
    return this._run('_consume', [key, pointsToConsume, options]);
  }

  penalty(key, points = 1, options = {}) {
    return this._run('_penalty', [key, points, options]);
  }

  reward(key, points = 1, options = {}) {
    return this._run('_reward', [key, points, options]);
  }

  get(key, options = {}) {
    return this._run('_get', [key, options]);
  }

  set(key, points, secDuration, options = {}) {
    return this._run('_set', [key, points, secDuration, options]);
  }

  block(key, secDuration, options = {}) {
    return this._run('_block', [key, secDuration, options]);
  }

  delete(key) {
    return this._run('_delete', [key]);
  }

}
