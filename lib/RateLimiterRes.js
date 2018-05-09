module.exports = class RateLimiterRes {
  constructor() {
    this._msBeforeNext = 0; // Milliseconds before next action
    this._remainingPoints = 0; // Remaining points in current duration
  }

  get msBeforeNext() {
    return this._msBeforeNext;
  }

  set msBeforeNext(ms) {
    this._msBeforeNext = ms;
    return this;
  }

  get remainingPoints() {
    return this._remainingPoints;
  }

  set remainingPoints(p) {
    this._remainingPoints = p;
    return this;
  }
};
