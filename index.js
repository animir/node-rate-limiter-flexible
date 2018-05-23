const RateLimiterRedis = require('./lib/RateLimiterRedis');
const { RateLimiterClusterMaster, RateLimiterCluster } = require('./lib/RateLimiterCluster');
const RateLimiterMemory = require('./lib/RateLimiterMemory');

module.exports = {
  RateLimiterRedis,
  RateLimiterMemory,
  RateLimiterClusterMaster,
  RateLimiterCluster,
};
