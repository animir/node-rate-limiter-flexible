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
      const msBeforeExpires = this._storage[key].expiresAt
        ? this._storage[key].expiresAt.getTime() - new Date().getTime()
        : -1;
      if (msBeforeExpires !== 0) {
        // Change value
        this._storage[key].value = this._storage[key].value + value;

        return new RateLimiterRes(0, msBeforeExpires, this._storage[key].value, false);
      }

      return this.set(key, value, durationSec);
    }
    return this.set(key, value, durationSec);
  }

  set(key, value, durationSec) {
    const durationMs = durationSec * 1000;

    if (this._storage[key] && this._storage[key].timeoutId) {
      clearTimeout(this._storage[key].timeoutId);
    }

    this._storage[key] = new Record(
      value,
      durationMs > 0 ? new Date(Date.now() + durationMs) : null
    );
    if (durationMs > 0) {
      this._storage[key].timeoutId = setTimeout(() => {
        delete this._storage[key];
      }, durationMs);
      this._storage[key].timeoutId.unref();
    }

    return new RateLimiterRes(0, durationMs === 0 ? -1 : durationMs, this._storage[key].value, true);
  }

  /**
   *
   * @param key
   * @returns {*}
   */
  get(key) {
    if (this._storage[key]) {
      const msBeforeExpires = this._storage[key].expiresAt
        ? this._storage[key].expiresAt.getTime() - new Date().getTime()
        : -1;
      return new RateLimiterRes(0, msBeforeExpires, this._storage[key].value, false);
    }
    return null;
  }

  /**
   *
   * @param key
   * @returns {boolean}
   */
  delete(key) {
    if (this._storage[key]) {
      delete this._storage[key];
      return true;
    }
    return false;
  }
};
