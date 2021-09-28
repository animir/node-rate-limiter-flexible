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
    this.addMs(key, sec * 1000);
  }

  /**
   * Add new blocked key for ms
   *
   * @param key String
   * @param ms Number
   */
  addMs(key, ms) {
    this._keys[key] = Date.now() + ms;
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

  /**
   * If key is not given, delete all data in memory
   * 
   * @param {string|undefined} key
   */
  delete(key) {
    if (key) {
      delete this._keys[key];
    } else {
      Object.keys(this._keys).forEach((key) => {
        delete this._keys[key];
      });
    }
  }
};
