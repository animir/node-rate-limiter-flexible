module.exports = class RateLimiterRes {
  constructor(remainingPoints, msBeforeNext, consumedPoints, isFirstInDuration) {
    this.remainingPoints = typeof remainingPoints === 'undefined' ? 0 : remainingPoints; // Remaining points in current duration
    this.msBeforeNext = typeof msBeforeNext === 'undefined' ? 0 : msBeforeNext; // Milliseconds before next action
    this.consumedPoints = typeof consumedPoints === 'undefined' ? 0 : consumedPoints; // Consumed points in current duration
    this.isFirstInDuration = typeof isFirstInDuration === 'undefined' ? false : isFirstInDuration;
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

  get consumedPoints() {
    return this._consumedPoints;
  }

  set consumedPoints(p) {
    this._consumedPoints = p;
    return this;
  }

  get isFirstInDuration() {
    return this._isFirstInDuration;
  }

  set isFirstInDuration(value) {
    this._isFirstInDuration = Boolean(value);
  }

  _getDecoratedProperties() {
    return {
      remainingPoints: this.remainingPoints,
      msBeforeNext: this.msBeforeNext,
      consumedPoints: this.consumedPoints,
      isFirstInDuration: this.isFirstInDuration,
    };
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this._getDecoratedProperties();
  }

  toString() {
    return JSON.stringify(this._getDecoratedProperties());
  }

  toJSON() {
    return this._getDecoratedProperties();
  }
};
