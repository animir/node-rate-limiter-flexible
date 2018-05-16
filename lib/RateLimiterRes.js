module.exports = class RateLimiterRes {
  constructor(remainingPoints, msBeforeNext) {
    this.remainingPoints = typeof remainingPoints === 'undefined' ? 0 : remainingPoints; // Remaining points in current duration
    this.msBeforeNext = typeof msBeforeNext === 'undefined' ? 0 : msBeforeNext; // Milliseconds before next action
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
