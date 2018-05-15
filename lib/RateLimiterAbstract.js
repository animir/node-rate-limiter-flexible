module.exports = class RateLimiterAbstract {
  /**
   *
   * @param opts Object Defaults {
   *   points: 4, // Number of points
   *   duration: 1, // Per seconds
   *   execEvenly: false, // Execute allowed actions evenly over duration
   * }
   */
  constructor(opts = {}) {
    this.points = opts.points;
    this.duration = opts.duration;
    this.execEvenly = opts.execEvenly;
  }

  get points() {
    return this._points;
  }

  set points(value) {
    this._points = value || 4;
  }

  get duration() {
    return this._duration;
  }

  set duration(value) {
    this._duration = value || 1;
  }

  get execEvenly() {
    return this._execEvenly;
  }

  set execEvenly(value) {
    this._execEvenly = typeof value === 'undefined' ? false : Boolean(value);
  }

  static getKey(key) {
    return `rlflx:${key}`;
  }

  consume() {
    throw new Error("You have to implement the method 'consume'!");
  }

  penalty() {
    throw new Error("You have to implement the method 'penalty'!");
  }

  reward() {
    throw new Error("You have to implement the method 'reward'!");
  }
};
