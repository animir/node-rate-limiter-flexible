module.exports = class BlockedKeys {
  constructor() {
    this._keys = new Map(); // Map {'key' => 1526279430331}
  }

  collectExpired() {
    const now = Date.now();

    for (const [key, expire] of this._keys) {
      if (expire <= now) {
        this._keys.delete(key);
      }
    }
  }

  /**
   * Add new blocked key
   *
   * @param key String
   * @param sec Number
   */
  add(key, sec) {
    this.addMs(key, sec * 1000);
  }

  /**
   * Add new blocked key for ms
   *
   * @param key String
   * @param ms Number
   */
  addMs(key, ms) {
    this._keys.set(key, Date.now() + ms);
    if (this._keys.size > 999) {
      this.collectExpired();
    }
  }

  /**
   * 0 means not blocked
   *
   * @param key
   * @returns {number}
   */
  msBeforeExpire(key) {
    const expire = this._keys.get(key);

    const now = Date.now();
    if (expire && expire >= now) {
      return expire - now;
    }
    return 0;
  }

  /**
   * If key is not given, delete all data in memory
   *
   * @param {string|undefined} key
   */
  delete(key) {
    if (key) {
      this._keys.delete(key);
    } else {
      this._keys.clear();
    }
  }
};
