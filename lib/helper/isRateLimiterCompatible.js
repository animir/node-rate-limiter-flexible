const RateLimiterAbstract = require('../RateLimiterAbstract');
const RateLimiterCompatibleAbstract = require('../RateLimiterCompatibleAbstract');

module.exports = function isRateLimiterCompatible(obj) {
  return obj instanceof RateLimiterAbstract || obj instanceof RateLimiterCompatibleAbstract;
};
