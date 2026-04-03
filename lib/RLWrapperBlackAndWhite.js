const RateLimiterRes = require('./RateLimiterRes');
const RateLimiterCompatibleAbstract = require('./RateLimiterCompatibleAbstract');

module.exports = class RLWrapperBlackAndWhite extends RateLimiterCompatibleAbstract {
  constructor(opts = {}) {
    super();
    this.limiter = opts.limiter;
    this.blackList = opts.blackList;
    this.whiteList = opts.whiteList;
    this.isBlackListed = opts.isBlackListed;
    this.isWhiteListed = opts.isWhiteListed;
    this.runActionAnyway = opts.runActionAnyway;
  }

  get limiter() {
    return this._limiter;
  }

  set limiter(value) {
    if (typeof value === 'undefined') {
      throw new Error('limiter is not set');
    }

    this._limiter = value;
  }

  get keyPrefix() {
    return this.limiter.keyPrefix;
  }

  get blockDuration() {
    return this.limiter.blockDuration;
  }

  set blockDuration(value) {
    this.limiter.blockDuration = value;
  }

  get execEvenly() {
    return this.limiter.execEvenly;
  }

  set execEvenly(value) {
    this.limiter.execEvenly = value;
  }

  get runActionAnyway() {
    return this._runActionAnyway;
  }

  set runActionAnyway(value) {
    this._runActionAnyway = typeof value === 'undefined' ? false : value;
  }

  get blackList() {
    return this._blackList;
  }

  set blackList(value) {
    this._blackList = Array.isArray(value) ? value : [];
  }

  get isBlackListed() {
    return this._isBlackListed;
  }

  set isBlackListed(func) {
    if (typeof func === 'undefined') {
      func = () => false;
    }
    if (typeof func !== 'function') {
      throw new Error('isBlackListed must be function');
    }
    this._isBlackListed = func;
  }

  get whiteList() {
    return this._whiteList;
  }

  set whiteList(value) {
    this._whiteList = Array.isArray(value) ? value : [];
  }

  get isWhiteListed() {
    return this._isWhiteListed;
  }

  set isWhiteListed(func) {
    if (typeof func === 'undefined') {
      func = () => false;
    }
    if (typeof func !== 'function') {
      throw new Error('isWhiteListed must be function');
    }
    this._isWhiteListed = func;
  }

  isBlackListedSomewhere(key) {
    return this.blackList.indexOf(key) >= 0 || this.isBlackListed(key);
  }

  isWhiteListedSomewhere(key) {
    return this.whiteList.indexOf(key) >= 0 || this.isWhiteListed(key);
  }

  getBlackRes() {
    return new RateLimiterRes(0, Number.MAX_SAFE_INTEGER, 0, false);
  }

  getWhiteRes() {
    return new RateLimiterRes(Number.MAX_SAFE_INTEGER, 0, 0, false);
  }

  rejectBlack() {
    return Promise.reject(this.getBlackRes());
  }

  resolveBlack() {
    return Promise.resolve(this.getBlackRes());
  }

  resolveWhite() {
    return Promise.resolve(this.getWhiteRes());
  }

  _execAction(action, key, args, rejectOnBlack = false) {
    let res;
    if (this.isWhiteListedSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackListedSomewhere(key)) {
      res = rejectOnBlack ? this.rejectBlack() : this.resolveBlack();
    }

    if (typeof res === 'undefined') {
      return this.limiter[action](key, ...args);
    }

    if (this.runActionAnyway) {
      this.limiter[action](key, ...args).catch(() => {});
    }
    return res;
  }

  consume(key, pointsToConsume = 1, options = {}) {
    return this._execAction('consume', key, [pointsToConsume, options], true);
  }

  block(key, secDuration, options = {}) {
    return this._execAction('block', key, [secDuration, options]);
  }

  penalty(key, points = 1, options = {}) {
    return this._execAction('penalty', key, [points, options]);
  }

  reward(key, points = 1, options = {}) {
    return this._execAction('reward', key, [points, options]);
  }

  get(key, options = {}) {
    if (this.runActionAnyway) {
      return this.limiter.get(key, options);
    }
    return this._execAction('get', key, [options]);
  }

  set(key, points, secDuration, options = {}) {
    return this._execAction('set', key, [points, secDuration, options]);
  }

  delete(key, options = {}) {
    return this.limiter.delete(key, options);
  }
};
