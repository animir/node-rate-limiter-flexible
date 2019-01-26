const RateLimiterRes = require('./RateLimiterRes');

module.exports = class RLWrapperBlackAndWhite {
  constructor(opts = {}) {
    this.limiter = opts.limiter;
    this.blackList = opts.blackList;
    this.whiteList = opts.whiteList;
    this.isBlack = opts.isBlack;
    this.isWhite = opts.isWhite;
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

  get isBlack() {
    return this._isBlack;
  }

  set isBlack(func) {
    if (typeof func === 'undefined') {
      func = () => false;
    }
    if (typeof func !== 'function') {
      throw new Error('isBlack must be function');
    }
    this._isBlack = func;
  }

  get whiteList() {
    return this._whiteList;
  }

  set whiteList(value) {
    this._whiteList = Array.isArray(value) ? value : [];
  }

  get isWhite() {
    return this._isWhite;
  }

  set isWhite(func) {
    if (typeof func === 'undefined') {
      func = () => false;
    }
    if (typeof func !== 'function') {
      throw new Error('isWhite must be function');
    }
    this._isWhite = func;
  }

  isBlackSomewhere(key) {
    return this.blackList.indexOf(key) >= 0 || this.isBlack(key);
  }

  isWhiteSomewhere(key) {
    return this.whiteList.indexOf(key) >= 0 || this.isWhite(key);
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

  consume(key, pointsToConsume = 1) {
    let res;
    if (this.isWhiteSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackSomewhere(key)) {
      res = this.rejectBlack();
    }

    if (typeof res === 'undefined') {
      return this.limiter.consume(key, pointsToConsume);
    }

    if (this.runActionAnyway) {
      this.limiter.consume(key, pointsToConsume).catch(() => {});
    }
    return res;
  }

  block(key, secDuration) {
    let res;
    if (this.isWhiteSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackSomewhere(key)) {
      res = this.resolveBlack();
    }

    if (typeof res === 'undefined') {
      return this.limiter.block(key, secDuration);
    }

    if (this.runActionAnyway) {
      this.limiter.block(key, secDuration).catch(() => {});
    }
    return res;
  }

  penalty(key, points) {
    let res;
    if (this.isWhiteSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackSomewhere(key)) {
      res = this.resolveBlack();
    }

    if (typeof res === 'undefined') {
      return this.limiter.penalty(key, points);
    }

    if (this.runActionAnyway) {
      this.limiter.penalty(key, points).catch(() => {});
    }
    return res;
  }

  reward(key, points) {
    let res;
    if (this.isWhiteSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackSomewhere(key)) {
      res = this.resolveBlack();
    }

    if (typeof res === 'undefined') {
      return this.limiter.reward(key, points);
    }

    if (this.runActionAnyway) {
      this.limiter.reward(key, points).catch(() => {});
    }
    return res;
  }

  get(key) {
    let res;
    if (this.isWhiteSomewhere(key)) {
      res = this.resolveWhite();
    } else if (this.isBlackSomewhere(key)) {
      res = this.resolveBlack();
    }

    if (typeof res === 'undefined' || this.runActionAnyway) {
      return this.limiter.get(key);
    }

    return res;
  }

  delete(key) {
    return this.limiter.delete(key);
  }
};
