module.exports = class Record {
  /**
   *
   * @param value int
   * @param expiresAt Date|int
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
    this._value = parseInt(value);
  }

  get expiresAt() {
    return this._expiresAt;
  }

  set expiresAt(value) {
    if (!(value instanceof Date) && Number.isInteger(value)) {
      value = new Date(value);
    }
    this._expiresAt = value;
  }

  get timeoutId() {
    return this._timeoutId;
  }

  set timeoutId(value) {
    this._timeoutId = value;
  }
};
