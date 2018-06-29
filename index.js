const RateLimiterRedis = require('./lib/RateLimiterRedis');
const RateLimiterMongo = require('./lib/RateLimiterMongo');
const RateLimiterMySQL = require('./lib/RateLimiterMySQL');
const RateLimiterPostgres = require('./lib/RateLimiterPostgres');
const { RateLimiterClusterMaster, RateLimiterCluster } = require('./lib/RateLimiterCluster');
const RateLimiterMemory = require('./lib/RateLimiterMemory');

module.exports = {
  RateLimiterRedis,
  RateLimiterMongo,
  RateLimiterMySQL,
  RateLimiterPostgres,
  RateLimiterMemory,
  RateLimiterClusterMaster,
  RateLimiterCluster,
};