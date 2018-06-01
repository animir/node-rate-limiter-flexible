const RateLimiterRedis = require('./lib/RateLimiterRedis');
const RateLimiterMongo = require('./lib/RateLimiterMongo');
const { RateLimiterClusterMaster, RateLimiterCluster } = require('./lib/RateLimiterCluster');
const RateLimiterMemory = require('./lib/RateLimiterMemory');

module.exports = {
  RateLimiterRedis,
  RateLimiterMongo,
  RateLimiterMemory,
  RateLimiterClusterMaster,
  RateLimiterCluster,
};