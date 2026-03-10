module.exports = class Record {
  /**
   *
   * @param value int
   * @param expiresAt Number|Date
   * @param timeoutId
   */
  constructor(value, expiresAt, timeoutId = null) {
    this.value = value;
    this.expiresAt = expiresAt;
    this.timeoutId = timeoutId;
  }

  get value() {
    return this._value;
  }

  set value(value) {
    this._value = parseInt(value, 10);
  }

  get expiresAt() {
    return this._expiresAt;
  }

  set expiresAt(value) {
    if (value instanceof Date) {
      this._expiresAt = value.getTime();
    } else {
      this._expiresAt = value;
    }
  }

  get timeoutId() {
    return this._timeoutId;
  }

  set timeoutId(value) {
    this._timeoutId = value;
  }
};
