module.exports = class RateLimiterSetupError extends Error {
  constructor(message) {
    super();
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.name = 'RateLimiterSetupError';
    this.message = message;
  }
};
