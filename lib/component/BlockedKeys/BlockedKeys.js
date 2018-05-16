module.exports = class BlockedKeys {
  constructor() {
    this._keys = {}; // {'key': 1526279430331}
    this._addedKeysAmount = 0;
  }

  collectExpired() {
    const now = Date.now();

    Object.keys(this._keys).forEach((key) => {
      if (this._keys[key] <= now) {
        delete this._keys[key];
      }
    });

    this._addedKeysAmount = Object.keys(this._keys).length;
  }

  /**
   * Add new blocked key
   *
   * @param key String
   * @param sec Number
   */
  add(key, sec) {
    this._keys[key] = Date.now() + (sec * 1000);
    this._addedKeysAmount++;
    if (this._addedKeysAmount > 999) {
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
    const expire = this._keys[key];

    if (expire && expire >= Date.now()) {
      this.collectExpired();
      const now = Date.now();
      return expire >= now ? expire - now : 0;
    }

    return 0;
  }
};
