const RateLimiterRedis = require('./lib/RateLimiterRedis');
const RateLimiterMemory = require('./lib/RateLimiterMemory');

module.exports = {
  RateLimiterRedis,
  RateLimiterMemory
};