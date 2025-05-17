module.exports = class RateLimiterEtcdTransactionFailedError extends Error {
  constructor(message) {
    super();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.name = 'RateLimiterEtcdTransactionFailedError';
    this.message = message;
  }
};
