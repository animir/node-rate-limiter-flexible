module.exports = class RateLimiterAbstract {
  /**
   *
   * @param opts Object Defaults {
   *   points: 4, // Number of points
   *   duration: 1, // Per seconds
   *   blockDuration: 0, // Block if consumed more than points in current duration for blockDuration seconds
   *   execEvenly: false, // Execute allowed actions evenly over duration
   *   execEvenlyMinDelayMs: duration * 1000 / points, // ms, works with execEvenly=true option
   *   keyPrefix: 'rlflx',
   * }
   */
  constructor(opts = {}) {
    this.points = opts.points;
    this.duration = opts.duration;
    this.blockDuration = opts.blockDuration;
    this.execEvenly = opts.execEvenly;
    this.execEvenlyMinDelayMs = opts.execEvenlyMinDelayMs;
    this.keyPrefix = opts.keyPrefix;
  }

  get points() {
    return this._points;
  }

  set points(value) {
    this._points = value >= 0 ? value : 4;
  }

  get duration() {
    return this._duration;
  }

  set duration(value) {
    this._duration = typeof value === 'undefined' ? 1 : value;
  }

  get msDuration() {
    return this.duration * 1000;
  }

  get blockDuration() {
    return this._blockDuration;
  }

  set blockDuration(value) {
    this._blockDuration = typeof value === 'undefined' ? 0 : value;
  }

  get msBlockDuration() {
    return this.blockDuration * 1000;
  }

  get execEvenly() {
    return this._execEvenly;
  }

  set execEvenly(value) {
    this._execEvenly = typeof value === 'undefined' ? false : Boolean(value);
  }

  get execEvenlyMinDelayMs() {
    return this._execEvenlyMinDelayMs;
  }

  set execEvenlyMinDelayMs(value) {
    this._execEvenlyMinDelayMs = typeof value === 'undefined' ? Math.ceil(this.msDuration / this.points) : value;
  }

  get keyPrefix() {
    return this._keyPrefix;
  }

  set keyPrefix(value) {
    if (typeof value === 'undefined') {
      value = 'rlflx';
    }
    if (typeof value !== 'string') {
      throw new Error('keyPrefix must be string');
    }
    this._keyPrefix = value;
  }

  _getKeySecDuration(options = {}) {
    return options && options.customDuration >= 0
      ? options.customDuration
      : this.duration;
  }

  getKey(key) {
    return this.keyPrefix.length > 0 ? `${this.keyPrefix}:${key}` : key;
  }

  parseKey(rlKey) {
    return rlKey.substring(this.keyPrefix.length);
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

  get() {
    throw new Error("You have to implement the method 'get'!");
  }

  set() {
    throw new Error("You have to implement the method 'set'!");
  }

  block() {
    throw new Error("You have to implement the method 'block'!");
  }

  delete() {
    throw new Error("You have to implement the method 'delete'!");
  }
};
