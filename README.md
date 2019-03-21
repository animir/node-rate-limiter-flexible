[![Build Status](https://travis-ci.org/animir/node-rate-limiter-flexible.png)](https://travis-ci.org/animir/node-rate-limiter-flexible)
[![Coverage Status](https://coveralls.io/repos/animir/node-rate-limiter-flexible/badge.svg?branch=master)](https://coveralls.io/r/animir/node-rate-limiter-flexible?branch=master)
[![npm version](https://badge.fury.io/js/rate-limiter-flexible.svg)](https://www.npmjs.com/package/rate-limiter-flexible)
[![node version][node-image]][node-url]

[node-image]: https://img.shields.io/badge/node.js-%3E=_6.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/

<img src="img/rlflx-logo-small.png" width="50" alt="Logo"/>

## node-rate-limiter-flexible

**rate-limiter-flexible** limits number of actions by key and protects from DDoS and brute force attacks at any scale.

It works with _Redis_, process _Memory_, _Cluster_ or _PM2_, _Memcached_, _MongoDB_, _MySQL_, _PostgreSQL_ and allows to control requests rate in single process or distributed environment.

**Fast.** Average request takes `0.7ms` in Cluster and `2.5ms` in Distributed application. See [benchmarks](https://github.com/animir/node-rate-limiter-flexible#benchmark).

**Flexible.** Combine limiters, block key for some duration, delay actions, manage failover with insurance options, configure smart key blocking in memory and many others.

**Ready for growth.** It provides unified API for all limiters. Whenever your application grows, it is ready. Prepare your limiters in minutes.

**Friendly.** No matter which node package you prefer: `redis` or `ioredis`, `sequelize` or `knex`, `memcached`, native driver or `mongoose`. It works with all of them. 

It uses **fixed window** as it is much faster than rolling window. 
[See comparative benchmarks with other libraries here](https://github.com/animir/node-rate-limiter-flexible/wiki/Comparative-benchmarks)

:star: It is **STAR**ving, don't forget to feed the beast! :star:

## Installation

`npm i --save rate-limiter-flexible`

`yarn add rate-limiter-flexible`

## Basic Example

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

#### RateLimiterRes object

Both Promise resolve and reject return object of `RateLimiterRes` class if there is no any error.
Object attributes:
```javascript
RateLimiterRes = {
    msBeforeNext: 250, // Number of milliseconds before next action can be done
    remainingPoints: 0, // Number of remaining points in current duration 
    consumedPoints: 5, // Number of consumed points in current duration 
    isFirstInDuration: false, // action is first in current duration 
}
```

You may want to set next HTTP headers to response:
```javascript
const headers = {
  "Retry-After": rateLimiterRes.msBeforeNext / 1000,
  "X-RateLimit-Limit": opts.points,
  "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
  "X-RateLimit-Reset": new Date(Date.now() + rateLimiterRes.msBeforeNext)
}
```

### Advantages:
* TypeScript declaration bundled
* in-memory Block Strategy against really powerful DDoS attacks (like 100k requests per sec) [Read about it and benchmarking here](https://github.com/animir/node-rate-limiter-flexible/wiki/In-memory-Block-Strategy)
* Insurance Strategy as emergency solution if database / store is down [Read about Insurance Strategy here](https://github.com/animir/node-rate-limiter-flexible/wiki/Insurance-Strategy)
* backed on native Promises
* works in Cluster or PM2 without additional software [See RateLimiterCluster benchmark and detailed description here](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster)
* shape traffic with Leaky Bucket analogy [Read about Leaky Bucket analogy](https://github.com/animir/node-rate-limiter-flexible/wiki/Leaky-Bucket-Analogy-execute-actions-evenly)
* no race conditions
* covered by tests
* no prod dependencies
* useful `get`, `block`, `delete`, `penalty` and `reward` methods

### Middlewares and plugins
* [Express middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Express-Middleware)
* [Koa middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Koa-Middleware)
* [Hapi plugin](https://github.com/animir/node-rate-limiter-flexible/wiki/Hapi-plugin)

Other examples on Wiki:
* [Login endpoint protection](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#login-endpoint-protection)
* [Websocket connection prevent flooding](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#websocket-single-connection-prevent-flooding)
* [Dynamic block duration](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#dynamic-block-duration)
* [Authorized users specific limits](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#authorized-and-not-authorized-users)
* [Different limits for different parts of application](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#different-limits-for-different-parts-of-application)
* [Apply Block Strategy](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#apply-in-memory-block-strategy-for-better-protection)
* [Setup Insurance Strategy](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#apply-in-memory-block-strategy-for-better-protection)

### Docs and Examples

* [Options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options)
* [API methods](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods)
* [RateLimiterRedis](https://github.com/animir/node-rate-limiter-flexible/wiki/Redis)
* [RateLimiterMemcache](https://github.com/animir/node-rate-limiter-flexible/wiki/Memcache)
* [RateLimiterMongo](https://github.com/animir/node-rate-limiter-flexible/wiki/Mongo) (with [sharding support](https://github.com/animir/node-rate-limiter-flexible/wiki/Mongo#mongodb-sharding-options))
* [RateLimiterMySQL](https://github.com/animir/node-rate-limiter-flexible/wiki/MySQL) (support Sequelize and Knex)
* [RateLimiterPostgres](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL) (support Sequelize and Knex)
* [RateLimiterCluster](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster) ([PM2 cluster docs read here](https://github.com/animir/node-rate-limiter-flexible/wiki/PM2-cluster))
* [RateLimiterMemory](https://github.com/animir/node-rate-limiter-flexible/wiki/Memory)
* [RateLimiterUnion](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterUnion) Combine 2 or more limiters to act as single
* [RLWrapperBlackAndWhite](https://github.com/animir/node-rate-limiter-flexible/wiki/Black-and-White-lists) Black and White lists
* [Express middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Express-Middleware)
* [Koa middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Koa-Middleware)

## Basic Options

* `points` 
    
    `Default: 4` 
    
    Maximum number of points can be consumed over duration

* `duration` 

    `Default: 1` 
    
    Number of seconds before consumed points are reset

* `storeClient` 

    `Required for store limiters` 

    Have to be `redis`, `ioredis`, `memcached`, `mongodb`, `pg`, `mysql2`, `mysql` or any other related pool or connection.

### Other options on Wiki:
* [keyPrefix](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#keyprefix) Make keys unique among different limiters.
* [blockDuration](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#blockduration) Block for N seconds, if consumed more than points.
* [inmemoryBlockOnConsumed](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#inmemoryblockonconsumed) Against powerful DoS.
* [inmemoryBlockDuration](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#inmemoryblockduration)
* [insuranceLimiter](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#insurancelimiter) Make it more stable with less efforts.
* [storeType](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#storetype) Have to be set to `knex`, if you use it.
* [dbName](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#dbname) Where to store points.
* [tableName](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#tablename) Table/collection.
* [clearExpiredByTimeout](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#clearexpiredbytimeout) For MySQL and PostgreSQL.

Cut off load picks:
* [execEvenly](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#execevenly)
* [execEvenlyMinDelayMs](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#execevenlymindelayms)

Specific:
* [indexKeyPrefix](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#indexkeyprefix) Combined indexes of MongoDB.
* [timeoutMs](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#timeoutms) For Cluster.

## API

Read detailed description on Wiki.

* [consume(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterconsumekey-points--1) Consume points by key.
* [get(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimitergetkey) Get `RateLimiterRes` or `null`.
* [block(key, secDuration)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterblockkey-secduration) Block key for `secDuration` seconds.
* [delete(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterdeletekey) Reset consumed points.
* [penalty(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterpenaltykey-points--1) Increase number of consumed points in current duration.
* [reward(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterrewardkey-points--1) Decrease number of consumed points in current duration.
* [getKey(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimitergetkeykey) Get internal prefixed key.

## Benchmark

Average latency during test pure NodeJS endpoint in cluster of 4 workers with everything set up on one server.

1000 concurrent clients with maximum 2000 requests per sec during 30 seconds. 

```text
1. Memory     0.34 ms
2. Cluster    0.69 ms
3. Redis      2.45 ms
4. Memcached  3.89 ms
5. Mongo      4.75 ms
```

500 concurrent clients with maximum 1000 req per sec during 30 seconds
```text
6. PostgreSQL 7.48 ms (with connection pool max 100)
7. MySQL     14.59 ms (with connection pool 100)
```

## Contribution

Appreciated, feel free!

Make sure you've launched `npm run eslint` before creating PR, all errors have to be fixed.

You can try to run `npm run eslint-fix` to fix some issues.

Any new limiter with storage have to be extended from `RateLimiterStoreAbstract`.
It has to implement at least 3 methods:
* `_getRateLimiterRes` parses raw data from store to `RateLimiterRes` object.
* `_upsert` inserts or updates limits data by key and returns raw data.
* `_get` returns raw data by key.
* `_delete` deletes all key related data and returns `true` on deleted, `false` if key is not found.

All other methods depends on store. See `RateLimiterRedis` or `RateLimiterPostgres` for example.
