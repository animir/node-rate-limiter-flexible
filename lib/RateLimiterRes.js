module.exports = class RateLimiterRes {
  constructor() {
    this._msBeforeNext = 0;
    this._points = 0;
  }

  get msBeforeNext() {
    return this._msBeforeNext;
  }

  set msBeforeNext(ms) {
    this._msBeforeNext = ms;
    return this;
  }

  get points() {
    return this._points;
  }

  set points(p) {
    this._points = p;
    return this;
  }
};
