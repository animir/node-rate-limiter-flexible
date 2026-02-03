const Record = require('./Record');
const RateLimiterRes = require('../../RateLimiterRes');

module.exports = class MemoryStorage {
  constructor() {
    /**
     * @type {Map<string, Record>}
     * @private
     */
    this._storage = new Map();
  }

  incrby(key, value, durationSec) {
    const record = this._storage.get(key);
    if (record) {
      const msBeforeExpires = record.expiresAt
        ? record.expiresAt - Date.now()
        : -1;
      if (!record.expiresAt || msBeforeExpires > 0) {
        // Change value
        record.value = record.value + value;

        return new RateLimiterRes(0, msBeforeExpires, record.value, false);
      }

      return this.set(key, value, durationSec);
    }
    return this.set(key, value, durationSec);
  }

  set(key, value, durationSec) {
    const durationMs = durationSec * 1000;

    const existingRecord = this._storage.get(key);
    if (existingRecord && existingRecord.timeoutId) {
      clearTimeout(existingRecord.timeoutId);
    }

    const record = new Record(
      value,
      durationMs > 0 ? Date.now() + durationMs : null
    );
    this._storage.set(key, record);

    if (durationMs > 0) {
      record.timeoutId = setTimeout(() => {
        this._storage.delete(key);
      }, durationMs);
      if (record.timeoutId.unref) {
        record.timeoutId.unref();
      }
    }

    return new RateLimiterRes(0, durationMs === 0 ? -1 : durationMs, record.value, true);
  }

  /**
   *
   * @param key
   * @returns {*}
   */
  get(key) {
    const record = this._storage.get(key);
    if (record) {
      const msBeforeExpires = record.expiresAt
        ? record.expiresAt - Date.now()
        : -1;
      return new RateLimiterRes(0, msBeforeExpires, record.value, false);
    }
    return null;
  }

  /**
   *
   * @param key
   * @returns {boolean}
   */
  delete(key) {
    const record = this._storage.get(key);
    if (record) {
      if (record.timeoutId) {
        clearTimeout(record.timeoutId);
      }
      this._storage.delete(key);
      return true;
    }
    return false;
  }
};
