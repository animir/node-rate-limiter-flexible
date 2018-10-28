[![Build Status](https://travis-ci.org/animir/node-rate-limiter-flexible.png)](https://travis-ci.org/animir/node-rate-limiter-flexible)
[![Coverage Status](https://coveralls.io/repos/animir/node-rate-limiter-flexible/badge.svg?branch=master)](https://coveralls.io/r/animir/node-rate-limiter-flexible?branch=master)
[![npm version](https://badge.fury.io/js/rate-limiter-flexible.svg)](https://www.npmjs.com/package/rate-limiter-flexible)
[![node version][node-image]][node-url]

[node-image]: https://img.shields.io/badge/node.js-%3E=_6.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/

<img src="img/rlflx-logo-small.png" width="50" alt="Logo"/>

## node-rate-limiter-flexible

**rate-limiter-flexible** limits number of actions by key and protects from DDoS and brute force attacks at any scale.

**Fast.** Average request takes `0.7ms` in Cluster and `2.5ms` in Distributed application.

**Flexible.** Combine limiters, block key for some duration, delay actions, manage failover with insurance options, configure smart key blocking in memory and many others.

**Ready for growth.** It provides unified API for all limiters. Whenever your application grows, it is ready. Prepare your limiters in minutes.

**Friendly.** No matter which node package you prefer: `redis` or `ioredis`, `sequelize` or `knex`, native driver or `mongoose`. It works with all of them.

It works in process 
_Memory_, _Cluster_, _MongoDB_, _MySQL_, _PostgreSQL_ or _Redis_ allows to control requests rate in single process or distributed environment. 

It uses **fixed window** as it is much faster than rolling window. 
[See comparative benchmarks with other libraries here](https://github.com/animir/node-rate-limiter-flexible/wiki/Comparative-benchmarks)

:star: It is **STAR**ving, don't forget to feed the beast! :star:

Advantages:
* in-memory Block Strategy against really powerful DDoS attacks (like 100k requests per sec) [Read about it and benchmarking here](https://github.com/animir/node-rate-limiter-flexible/wiki/In-memory-Block-Strategy)
* Insurance Strategy as emergency solution if database / store is down [Read about Insurance Strategy here](https://github.com/animir/node-rate-limiter-flexible/wiki/Insurance-Strategy)
* backed on native Promises
* works in Cluster without additional software [See RateLimiterCluster benchmark and detailed description here](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster)
* shape traffic with Leaky Bucket analogy [Read about Leaky Bucket analogy](https://github.com/animir/node-rate-limiter-flexible/wiki/Leaky-Bucket-Analogy---execute-actions-evenly)
* no race conditions
* covered by tests
* no prod dependencies
* useful `get`, `block`, `penalty` and `reward` methods

### Example

```javascript
const opts = {
  points: 6, // 6 points
  duration: 1, // Per second
};

const rateLimiter = new RateLimiterMemory(opts);

rateLimiter.consume(remoteAddress, 2) // consume 2 points
    .then((rateLimiterRes) => {
      // 2 points consumed
    })
    .catch((rateLimiterRes) => {
      // Not enough points to consume
    });
```


### Express middleware

```javascript
const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.connection.remoteAddress)
    .then(() => {
      next();
    })
    .catch((rejRes) => {
      res.status(429).send('Too Many Requests');
    });
};
```

### Koa middleware

```javascript
app.use(async (ctx, next) => {
  try {
    await rateLimiter.consume(ctx.ip)
    next()
  } catch (rejRes) {
    ctx.status = 429
    ctx.body = 'Too Many Requests'
  }
})
```

### Docs and Examples

* [RateLimiterRedis](#ratelimiterredis)
* [RateLimiterMongo](https://github.com/animir/node-rate-limiter-flexible/wiki/Mongo)
* [RateLimiterMySQL](https://github.com/animir/node-rate-limiter-flexible/wiki/MySQL) (support Sequelize and Knex)
* [RateLimiterPostgres](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL) (support Sequelize and Knex)
* [RateLimiterCluster](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster)
* [RateLimiterMemory](https://github.com/animir/node-rate-limiter-flexible/wiki/Memory)
* [RateLimiterUnion](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterUnion) Combine 2 or more limiters to act as single
* [RLWrapperBlackAndWhite](https://github.com/animir/node-rate-limiter-flexible/wiki/Black-and-White-lists) Black and White lists
* [Express middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Express-Middleware)
* [Koa middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Koa-Middleware)
* [Options](#options)
* [API](#api)

### Benchmark

Average latency during test pure NodeJS endpoint in cluster of 4 workers with everything set up on one server.

1000 concurrent clients with maximum 2000 requests per sec during 30 seconds. 

```text
1. Memory   0.34 ms
2. Cluster  0.69 ms
3. Redis    2.45 ms
4. Mongo    4.75 ms
```

500 concurrent clients with maximum 1000 req per sec during 30 seconds
```text
5. PostgreSQL 7.48 ms (with connection pool max 100)
6. MySQL     14.59 ms (with connection pool 100)
```

## Installation

`npm i rate-limiter-flexible`

`yarn add rate-limiter-flexible`

## Options

* `keyPrefix` `Default: 'rlflx'` If you need to create several limiters for different purpose. 

    Note: for some limiters it should correspond to Storage requirements for tables or collections name,
     as `keyPrefix` may be used as their name.

* `points` `Default: 4` Maximum number of points can be consumed over duration

* `duration` `Default: 1` Number of seconds before consumed points are reset

* `execEvenly` `Default: false` Delay action to be executed evenly over duration
First action in duration is executed without delay.
All next allowed actions in current duration are delayed by formula `msBeforeDurationEnd / (remainingPoints + 2)` 
with minimum delay of `duration * 1000 / points`
It allows to cut off load peaks similar way to Leaky Bucket. [Read detailed Leaky Bucket description](https://github.com/animir/node-rate-limiter-flexible/wiki/Leaky-Bucket-Analogy-execute-actions-evenly)

    Note: it isn't recommended to use it for long duration and few points, 
    as it may delay action for too long with default `execEvenlyMinDelayMs`.

* `execEvenlyMinDelayMs` `Default: duration * 1000 / points` Sets minimum delay in milliseconds, when action is delayed with `execEvenly`  

* `blockDuration` `Default: 0` If positive number and consumed more than points in current duration, 
block for `blockDuration` seconds. 

    It sets consumed points more than allowed points for `blockDuration` seconds, so actions are rejected.

#### Options specific to Redis, Mongo, MySQL, PostgreSQL

* `storeClient` `Required` Have to be `redis`, `ioredis`, `mongodb`, `pg`, `mysql2`, `mysql` or any other related pool or connection.

* `inmemoryBlockOnConsumed` `Default: 0` Against DDoS attacks. Blocked key isn't checked by requesting Redis, MySQL or Mongo.
In-memory blocking works in **current process memory**. 

* `inmemoryBlockDuration` `Default: 0` Block key for `inmemoryBlockDuration` seconds, 
if `inmemoryBlockOnConsumed` or more points are consumed 

* `insuranceLimiter` `Default: undefined` Instance of RateLimiterAbstract extended object to store limits, 
when database comes up with any error. 

    All data from `insuranceLimiter` is NOT copied to parent limiter, when error gone

    **Note:** `insuranceLimiter` automatically setup `blockDuration` and `execEvenly` 
to same values as in parent to avoid unexpected behaviour

#### Options specific to MySQL and PostgreSQL

* `tableName` `Default: equals to 'keyPrefix' option` By default, limiter creates table for each unique `keyPrefix`. 
All limits for all limiters are stored in one table if custom name is set.

* `storeType` `Default: storeClient.constructor.name` It is required only for Knex and have to be set to 'knex'

#### Options specific to MySQL

* `dbName` `Default: 'rtlmtrflx'` Database where limits are stored. It is created during creating a limiter

#### Options specific to Mongo

* `dbName` `Default: 'node-rate-limiter-flexible'` Database where limits are stored. It is created during creating a limiter.
    Doesn't work with Mongoose, as mongoose connection is established to exact database.

#### Options specific to Cluster

* `timeoutMs` `Default: 5000` Timeout for communication between worker and master over IPC. 
If master doesn't response in time, promise is rejected with Error


## API

### RateLimiterRes object

Both Promise resolve and reject returns object of `RateLimiterRes` class if there is no any error.
Object attributes:
```javascript
RateLimiterRes = {
    msBeforeNext: 250, // Number of milliseconds before next action can be done
    remainingPoints: 0, // Number of remaining points in current duration 
    consumedPoints: 5, // Number of consumed points in current duration 
    isFirstInDuration: false, // action is first in current duration 
}
```

### rateLimiter.consume(key, points = 1)

Returns Promise, which: 
* **resolved** with `RateLimiterRes` when point(s) is consumed, so action can be done
* **rejected** only for database limiters if `insuranceLimiter` isn't setup: when some error happened, where reject reason `rejRes` is Error object
* **rejected** only for RateLimiterCluster if `insuranceLimiter` isn't setup: when `timeoutMs` exceeded, where reject reason `rejRes` is Error object
* **rejected** when there is no points to be consumed, where reject reason `rejRes` is `RateLimiterRes` object
* **rejected** when key is blocked (if block strategy is set up), where reject reason `rejRes` is `RateLimiterRes` object

Arguments:
* `key` is usually IP address or some unique client id
* `points` number of points consumed. `default: 1`

### rateLimiter.get(key)

Get `RateLimiterRes` in current duration.

Returns Promise, which: 
* **resolved** with `RateLimiterRes` if key is set
* **resolved** with `null` if key is NOT set or expired
* **rejected** only for database limiters if `insuranceLimiter` isn't setup: when some error happened, where reject reason `rejRes` is Error object
* **rejected** only for RateLimiterCluster if `insuranceLimiter` isn't setup: when `timeoutMs` exceeded, where reject reason `rejRes` is Error object

Arguments:
* `key` is usually IP address or some unique client id

### rateLimiter.penalty(key, points = 1)

Fine `key` by `points` number of points for **one duration**.

Note: Depending on time penalty may go to next durations

Returns Promise, which: 
* **resolved** with `RateLimiterRes`
* **rejected** only for database limiters if `insuranceLimiter` isn't setup: when some error happened, where reject reason `rejRes` is Error object
* **rejected** only for RateLimiterCluster if `insuranceLimiter` isn't setup: when `timeoutMs` exceeded, where reject reason `rejRes` is Error object

### rateLimiter.reward(key, points = 1)

Reward `key` by `points` number of points for **one duration**.

Note: Depending on time reward may go to next durations

Returns Promise, which: 
* **resolved** with `RateLimiterRes`
* **rejected** only for database limiters if `insuranceLimiter` isn't setup: when some error happened, where reject reason `rejRes` is Error object
* **rejected** only for RateLimiterCluster if `insuranceLimiter` isn't setup: when `timeoutMs` exceeded, where reject reason `rejRes` is Error object

### rateLimiter.block(key, secDuration)

Block `key` for `secDuration` seconds

Returns Promise, which: 
* **resolved** with `RateLimiterRes`
* **rejected** only for database limiters if `insuranceLimiter` isn't setup: when some error happened, where reject reason `rejRes` is Error object
* **rejected** only for RateLimiterCluster if `insuranceLimiter` isn't setup: when `timeoutMs` exceeded, where reject reason `rejRes` is Error object

## Usage

### RateLimiterRedis

Redis >=2.6.12

It supports both `redis` and `ioredis` clients.

Redis client must be created with offline queue switched off.

```javascript
const redis = require('redis');
const redisClient = redis.createClient({ enable_offline_queue: false });

const Redis = require('ioredis');
const redisClient = new Redis({
  options: {
    enableOfflineQueue: false
  }
});

const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');

// It is recommended to process Redis errors and setup some reconnection strategy
redisClient.on('error', (err) => {
  
});

const opts = {
  // Basic options
  storeClient: redisClient,
  points: 5, // Number of points
  duration: 5, // Per second(s)
  
  // Custom
  execEvenly: false, // Do not delay actions evenly
  blockDuration: 0, // Do not block if consumed more than points
  keyPrefix: 'rlflx', // must be unique for limiters with different purpose
  
  // Database limiters specific
  inmemoryBlockOnConsumed: 10, // If 10 points consumed in current duration
  inmemoryBlockDuration: 30, // block for 30 seconds in current process memory
};

const rateLimiterRedis = new RateLimiterRedis(opts);

rateLimiterRedis.consume(remoteAddress)
    .then((rateLimiterRes) => {
      // ... Some app logic here ...
      
      // Depending on results it allows to fine
      rateLimiterRedis.penalty(remoteAddress, 3)
        .then((rateLimiterRes) => {});
      // or rise number of points for current duration
      rateLimiterRedis.reward(remoteAddress, 2)
        .then((rateLimiterRes) => {});
    })
    .catch((rejRes) => {
      if (rejRes instanceof Error) {
        // Some Redis error
        // Never happen if `insuranceLimiter` set up
        // Decide what to do with it in other case
      } else {
        // Can't consume
        // If there is no error, rateLimiterRedis promise rejected with number of ms before next request allowed
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).send('Too Many Requests');
      }
    });
```

#### RateLimiterRedis benchmark

Endpoint is pure NodeJS endpoint launched in `node:10.5.0-jessie` and `redis:4.0.10-alpine` Docker containers by PM2 with 4 workers

By `bombardier -c 1000 -l -d 30s -r 2000 -t 5s http://127.0.0.1:8000`

Test with 1000 concurrent requests with maximum 2000 requests per sec during 30 seconds

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2015.20     511.21   14570.19
  Latency        2.45ms     7.51ms   138.41ms
  Latency Distribution
     50%     1.95ms
     75%     2.16ms
     90%     2.43ms
     95%     2.77ms
     99%     5.73ms
  HTTP codes:
    1xx - 0, 2xx - 53556, 3xx - 0, 4xx - 6417, 5xx - 0
```

## Contribution

Appreciated, feel free!

Make sure you've launched `npm run eslint` before creating PR, all errors have to be fixed.

You can try to run `npm run eslint-fix` to fix some issues.

Any new limiter with storage have to be extended from `RateLimiterStoreAbstract`.
It has to implement at least 3 methods:
* `_getRateLimiterRes` parses raw data from store to `RateLimiterRes` object
* `_upsert` inserts or updates limits data by key and returns raw data
* `_get` returns raw data by key

All other methods depends on store. See `RateLimiterRedis` or `RateLimiterPostgres` for example.
