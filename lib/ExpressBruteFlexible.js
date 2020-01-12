const {
  LIMITER_TYPES,
  ERR_UNKNOWN_LIMITER_TYPE_MESSAGE,
} = require('./constants');
const crypto = require('crypto');
const {
  RateLimiterMemory,
  RateLimiterCluster,
  RateLimiterMemcache,
  RateLimiterMongo,
  RateLimiterMySQL,
  RateLimiterPostgres,
  RateLimiterRedis,
} = require('../index');

function getDelayMs(count, delays, maxWait) {
  let msDelay = maxWait;
  const delayIndex = count - 1;
  if (delayIndex >= 0 && delayIndex < delays.length) {
    msDelay = delays[delayIndex];
  }

  return msDelay;
}

const ExpressBruteFlexible = function (limiterType, options) {
  ExpressBruteFlexible.instanceCount++;
  this.name = `brute${ExpressBruteFlexible.instanceCount}`;

  this.options = Object.assign({}, ExpressBruteFlexible.defaults, options);
  if (this.options.minWait < 1) {
    this.options.minWait = 1;
  }

  const validLimiterTypes = Object.keys(ExpressBruteFlexible.LIMITER_TYPES).map(k => ExpressBruteFlexible.LIMITER_TYPES[k]);
  if (!validLimiterTypes.includes(limiterType)) {
    throw new Error(ERR_UNKNOWN_LIMITER_TYPE_MESSAGE);
  }
  this.limiterType = limiterType;

  this.delays = [this.options.minWait];
  while (this.delays[this.delays.length - 1] < this.options.maxWait) {
    const nextNum = this.delays[this.delays.length - 1] + (this.delays.length > 1 ? this.delays[this.delays.length - 2] : 0);
    this.delays.push(nextNum);
  }
  this.delays[this.delays.length - 1] = this.options.maxWait;

  // set default lifetime
  if (typeof this.options.lifetime === 'undefined') {
    this.options.lifetime = Math.ceil((this.options.maxWait / 1000) * (this.delays.length + this.options.freeRetries));
  }

  this.prevent = this.getMiddleware({
    prefix: this.options.prefix,
  });
};

ExpressBruteFlexible.prototype.getMiddleware = function (options) {
  const opts = Object.assign({}, options);
  const commonKeyPrefix = opts.prefix || '';
  const freeLimiterOptions = {
    storeClient: this.options.storeClient,
    storeType: this.options.storeType,
    keyPrefix: `${commonKeyPrefix}free`,
    dbName: this.options.dbName,
    tableName: this.options.tableName,
    points: this.options.freeRetries > 0 ? this.options.freeRetries - 1 : 0,
    duration: this.options.lifetime,
  };

  const blockLimiterOptions = {
    storeClient: this.options.storeClient,
    storeType: this.options.storeType,
    keyPrefix: `${commonKeyPrefix}block`,
    dbName: this.options.dbName,
    tableName: this.options.tableName,
    points: 1,
    duration: Math.min(this.options.lifetime, Math.ceil((this.options.maxWait / 1000))),
  };

  const counterLimiterOptions = {
    storeClient: this.options.storeClient,
    storeType: this.options.storeType,
    keyPrefix: `${commonKeyPrefix}counter`,
    dbName: this.options.dbName,
    tableName: this.options.tableName,
    points: 1,
    duration: this.options.lifetime,
  };

  switch (this.limiterType) {
    case 'memory':
      this.freeLimiter = new RateLimiterMemory(freeLimiterOptions);
      this.blockLimiter = new RateLimiterMemory(blockLimiterOptions);
      this.counterLimiter = new RateLimiterMemory(counterLimiterOptions);
      break;
    case 'cluster':
      this.freeLimiter = new RateLimiterCluster(freeLimiterOptions);
      this.blockLimiter = new RateLimiterCluster(blockLimiterOptions);
      this.counterLimiter = new RateLimiterCluster(counterLimiterOptions);
      break;
    case 'memcache':
      this.freeLimiter = new RateLimiterMemcache(freeLimiterOptions);
      this.blockLimiter = new RateLimiterMemcache(blockLimiterOptions);
      this.counterLimiter = new RateLimiterMemcache(counterLimiterOptions);
      break;
    case 'mongo':
      this.freeLimiter = new RateLimiterMongo(freeLimiterOptions);
      this.blockLimiter = new RateLimiterMongo(blockLimiterOptions);
      this.counterLimiter = new RateLimiterMongo(counterLimiterOptions);
      break;
    case 'mysql':
      this.freeLimiter = new RateLimiterMySQL(freeLimiterOptions);
      this.blockLimiter = new RateLimiterMySQL(blockLimiterOptions);
      this.counterLimiter = new RateLimiterMySQL(counterLimiterOptions);
      break;
    case 'postgres':
      this.freeLimiter = new RateLimiterPostgres(freeLimiterOptions);
      this.blockLimiter = new RateLimiterPostgres(blockLimiterOptions);
      this.counterLimiter = new RateLimiterPostgres(counterLimiterOptions);
      break;
    case 'redis':
      this.freeLimiter = new RateLimiterRedis(freeLimiterOptions);
      this.blockLimiter = new RateLimiterRedis(blockLimiterOptions);
      this.counterLimiter = new RateLimiterRedis(counterLimiterOptions);
      break;
    default:
      throw new Error(ERR_UNKNOWN_LIMITER_TYPE_MESSAGE);
  }

  let keyFunc = opts.key;
  if (typeof keyFunc !== 'function') {
    keyFunc = function (req, res, next) {
      next(opts.key);
    };
  }

  const getFailCallback = (() => (typeof opts.failCallback === 'undefined' ? this.options.failCallback : opts.failCallback));

  return (req, res, next) => {
    const cannotIncrementErrorObjectBase = {
      req,
      res,
      next,
      message: 'Cannot increment request count',
    };

    keyFunc(req, res, (key) => {
      if (!opts.ignoreIP) {
        key = ExpressBruteFlexible._getKey([req.ip, this.name, key]);
      } else {
        key = ExpressBruteFlexible._getKey([this.name, key]);
      }

      // attach a simpler "reset" function to req.brute.reset
      if (this.options.attachResetToRequest) {
        let reset = ((callback) => {
          Promise.all([
            this.freeLimiter.delete(key),
            this.blockLimiter.delete(key),
            this.counterLimiter.delete(key),
          ]).then(() => {
            if (typeof callback === 'function') {
              process.nextTick(() => {
                callback();
              });
            }
          }).catch((err) => {
            if (typeof callback === 'function') {
              process.nextTick(() => {
                callback(err);
              });
            }
          });
        });

        if (req.brute && req.brute.reset) {
          // wrap existing reset if one exists
          const oldReset = req.brute.reset;
          const newReset = reset;
          reset = function (callback) {
            oldReset(() => {
              newReset(callback);
            });
          };
        }
        req.brute = {
          reset,
        };
      }

      this.freeLimiter.consume(key)
        .then(() => {
          if (typeof next === 'function') {
            next();
          }
        })
        .catch(() => {
          Promise.all([
            this.blockLimiter.get(key),
            this.counterLimiter.get(key),
          ])
            .then((allRes) => {
              const [blockRes, counterRes] = allRes;

              if (blockRes === null) {
                const msDelay = getDelayMs(
                  counterRes ? counterRes.consumedPoints + 1 : 1,
                  this.delays,
                  // eslint-disable-next-line
                  this.options.maxWait
                );

                this.blockLimiter.penalty(key, 1, { customDuration: Math.ceil(msDelay / 1000) })
                  .then((blockPenaltyRes) => {
                    if (blockPenaltyRes.consumedPoints === 1) {
                      this.counterLimiter.penalty(key)
                        .then(() => {
                          if (typeof next === 'function') {
                            next();
                          }
                        })
                        .catch((err) => {
                          this.options.handleStoreError(Object.assign({}, cannotIncrementErrorObjectBase, { parent: err }));
                        });
                    } else {
                      const nextValidDate = new Date(Date.now() + blockPenaltyRes.msBeforeNext);

                      const failCallback = getFailCallback();
                      if (typeof failCallback === 'function') {
                        failCallback(req, res, next, nextValidDate);
                      }
                    }
                  })
                  .catch((err) => {
                    this.options.handleStoreError(Object.assign({}, cannotIncrementErrorObjectBase, { parent: err }));
                  });
              } else {
                const nextValidDate = new Date(Date.now() + blockRes.msBeforeNext);

                const failCallback = getFailCallback();
                if (typeof failCallback === 'function') {
                  failCallback(req, res, next, nextValidDate);
                }
              }
            })
            .catch((err) => {
              this.options.handleStoreError(Object.assign({}, cannotIncrementErrorObjectBase, { parent: err }));
            });
        });
    });
  };
};

ExpressBruteFlexible.prototype.reset = function (ip, key, callback) {
  let keyArgs = [];
  if (ip) {
    keyArgs.push(ip)
  }
  keyArgs.push(this.name);
  keyArgs.push(key);
  const ebKey = ExpressBruteFlexible._getKey(keyArgs);

  Promise.all([
    this.freeLimiter.delete(ebKey),
    this.blockLimiter.delete(ebKey),
    this.counterLimiter.delete(ebKey),
  ]).then(() => {
    if (typeof callback === 'function') {
      process.nextTick(() => {
        callback();
      });
    }
  }).catch((err) => {
    this.options.handleStoreError({
      message: 'Cannot reset request count',
      parent: err,
      key,
      ip,
    });
  });
};

ExpressBruteFlexible._getKey = function (arr) {
  let key = '';

  arr.forEach((part) => {
    if (part) {
      key += crypto.createHash('sha256').update(part).digest('base64');
    }
  });

  return crypto.createHash('sha256').update(key).digest('base64');
};

const setRetryAfter = function (res, nextValidRequestDate) {
  const secondUntilNextRequest = Math.ceil((nextValidRequestDate.getTime() - Date.now()) / 1000);
  res.header('Retry-After', secondUntilNextRequest);
};
ExpressBruteFlexible.FailTooManyRequests = function (req, res, next, nextValidRequestDate) {
  setRetryAfter(res, nextValidRequestDate);
  res.status(429);
  res.send({
    error: {
      text: 'Too many requests in this time frame.',
      nextValidRequestDate,
    },
  });
};
ExpressBruteFlexible.FailForbidden = function (req, res, next, nextValidRequestDate) {
  setRetryAfter(res, nextValidRequestDate);
  res.status(403);
  res.send({
    error: {
      text: 'Too many requests in this time frame.',
      nextValidRequestDate,
    },
  });
};
ExpressBruteFlexible.FailMark = function (req, res, next, nextValidRequestDate) {
  res.status(429);
  setRetryAfter(res, nextValidRequestDate);
  res.nextValidRequestDate = nextValidRequestDate;
  next();
};

ExpressBruteFlexible.defaults = {
  freeRetries: 2,
  attachResetToRequest: true,
  minWait: 500,
  maxWait: 1000 * 60 * 15,
  failCallback: ExpressBruteFlexible.FailTooManyRequests,
  handleStoreError(err) {
    // eslint-disable-next-line
    throw {
      message: err.message,
      parent: err.parent,
    };
  },
};

ExpressBruteFlexible.LIMITER_TYPES = LIMITER_TYPES;

ExpressBruteFlexible.instanceCount = 0;


module.exports = ExpressBruteFlexible;
