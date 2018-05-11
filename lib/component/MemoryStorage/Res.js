module.exports = class Res {
  constructor(consumedPoints, msBeforeNext) {
    this.consumedPoints = consumedPoints;
    this.msBeforeNext = msBeforeNext;
  }

  get consumedPoints() {
    return this._consumedPoints;
  }

  set consumedPoints(value) {
    this._consumedPoints = value;
  }

  get msBeforeNext() {
    return this._msBeforeNext;
  }

  set msBeforeNext(value) {
    this._msBeforeNext = value;
  }
};