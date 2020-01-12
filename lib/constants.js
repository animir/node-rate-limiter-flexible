const LIMITER_TYPES = {
  MEMORY: 'memory',
  CLUSTER: 'cluster',
  MEMCACHE: 'memcache',
  MONGO: 'mongo',
  REDIS: 'redis',
  MYSQL: 'mysql',
  POSTGRES: 'postgres',
};

const ERR_UNKNOWN_LIMITER_TYPE_MESSAGE = 'Unknown limiter type. Use one of LIMITER_TYPES constants.';

module.exports = {
  LIMITER_TYPES,
  ERR_UNKNOWN_LIMITER_TYPE_MESSAGE,
};
