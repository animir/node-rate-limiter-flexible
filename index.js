const RateLimiterRedis = require('./lib/RateLimiterRedis');
const RateLimiterMongo = require('./lib/RateLimiterMongo');
const RateLimiterMySQL = require('./lib/RateLimiterMySQL');
const { RateLimiterClusterMaster, RateLimiterCluster } = require('./lib/RateLimiterCluster');
const RateLimiterMemory = require('./lib/RateLimiterMemory');

module.exports = {
  RateLimiterRedis,
  RateLimiterMongo,
  RateLimiterMySQL,
  RateLimiterMemory,
  RateLimiterClusterMaster,
  RateLimiterCluster,
};