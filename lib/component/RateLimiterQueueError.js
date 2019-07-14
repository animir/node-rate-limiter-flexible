module.exports = class RateLimiterQueueError extends Error {
  constructor(message, extra) {
    super();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.name = 'CustomError';
    this.message = message;
    if (extra) {
      this.extra = extra;
    }
  }
};
