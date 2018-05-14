module.exports = class BlockedKeys {
  constructor() {
    this._keys = []; // [{k:'123', e:1526279430331}]
  }

  collectExpired() {
    const now = Date.now();

    for (let i = 0; i < this._keys.length; i++) {
      if (this._keys[i].e <= now) {
        this._keys = this._keys.slice(0, i);
        break;
      }
    }
  }

  /**
   * Add new blocked key to the beginning
   *
   * @param key String
   * @param sec Number
   */
  add(key, sec) {
    this.collectExpired();
    this._keys.unshift({k: key, e: Date.now() + sec * 1000});
  }

  /**
   * 0 means not blocked
   *
   * @param key
   * @returns {number}
   */
  msBeforeExpire(key) {
    const now = Date.now();

    for (let i = 0; i < this._keys.length; i++) {
      if (key === this._keys[i].k) {
        return this._keys[i].e >= now ? this._keys[i].e - now : 0;
      }
      if (this._keys[i].e < now) {
        return 0;
      }
    }

    return 0;
  }
};
