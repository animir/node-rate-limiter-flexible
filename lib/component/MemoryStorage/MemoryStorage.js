const Record = require('./Record');
const RateLimiterRes = require('../../RateLimiterRes');

module.exports = class MemoryStorage {
  constructor() {
    /**
     * @type {Object.<string, Record>}
     * @private
     */
    this._storage = {};
  }

  incrby(key, value, durationSec) {
    if (this._storage[key]) {
      const msBeforeExpires = this._storage[key].expiresAt.getTime() - new Date().getTime();
      if (msBeforeExpires > 0) {
        this._storage[key].value = this._storage[key].value + value;

        return new RateLimiterRes(0, msBeforeExpires, this._storage[key].value, false);
      }
      clearTimeout(this._storage[key].timeoutId);

      return this.set(key, value, durationSec);
    }
    return this.set(key, value, durationSec);
  }

  set(key, value, durationSec) {
    const durationMs = durationSec * 1000;

    this._storage[key] = new Record(value, new Date(Date.now() + durationMs));
    this._storage[key].timeoutId = setTimeout(() => {
      delete this._storage[key];
    }, durationMs);

    return new RateLimiterRes(0, durationMs, this._storage[key].value, true);
  }

  /**
   *
   * @param key
   * @returns {*}
   */
  get(key) {
    if (this._storage[key]) {
      const msBeforeExpires = this._storage[key].expiresAt.getTime() - new Date().getTime();
      return new RateLimiterRes(0, msBeforeExpires, this._storage[key].value, false);
    }
    return null;
  }
};
