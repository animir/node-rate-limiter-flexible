[![npm version](https://badge.fury.io/js/rate-limiter-flexible.svg)](https://www.npmjs.com/package/rate-limiter-flexible)
![npm](https://img.shields.io/npm/dm/rate-limiter-flexible.svg)
[![node version][node-image]][node-url]
[![deno version](https://img.shields.io/badge/deno-^1.5.3-lightgrey?logo=deno)](https://github.com/denoland/deno)

[node-image]: https://img.shields.io/badge/node.js-%3E=_20.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/

<img src="img/rlflx-logo-small.png" width="50" alt="Logo"/>

## node-rate-limiter-flexible

**rate-limiter-flexible** counts and limits the number of actions by key and protects from DDoS and brute force attacks at any scale.

It works with _Valkey_, _Redis_, _Prisma_, _DynamoDB_, process _Memory_, _Cluster_ or _PM2_, _Memcached_, _MongoDB_, _MySQL_, _SQLite_, and _PostgreSQL_.

Memory limiter also works in the browser.

**Atomic increments.** All operations in memory or distributed environment use atomic increments against race conditions.

**Fast.** Average request takes `0.7ms` in Cluster and `2.5ms` in Distributed application. See [benchmarks](https://github.com/animir/node-rate-limiter-flexible#benchmark).

**Flexible.** Combine limiters, block key for some duration, delay actions, manage failover with insurance options, configure smart key blocking in memory and many others.

**Ready for growth.** It provides a unified API for all limiters. Whenever your application grows, it is ready. Prepare your limiters in minutes.

**Friendly.** No matter which node package you prefer: [`valkey-glide`](https://www.npmjs.com/package/@valkey/valkey-glide) or [`iovalkey`](https://www.npmjs.com/package/iovalkey), `redis` or `ioredis`, `sequelize`/`typeorm` or `knex`, `memcached`, native driver or `mongoose`. It works with all of them.

**In-memory blocks.** Avoid extra requests to store with [inMemoryBlockOnConsumed](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#inmemoryblockonconsumed).

**Deno compatible** See [this example](https://gist.github.com/animir/d06ca92931677f330d3f2d4c6c3108e4) 

It uses a **fixed window**, as it is much faster than a rolling window. 
[See comparative benchmarks with other libraries here](https://github.com/animir/node-rate-limiter-flexible/wiki/Comparative-benchmarks)

## Installation

`npm i --save rate-limiter-flexible`

`yarn add rate-limiter-flexible`

## Import
  
  ```javascript
  import { RateLimiterMemory } from "rate-limiter-flexible";
  
  // or import directly
  import RateLimiterMemory from "rate-limiter-flexible/lib/RateLimiterMemory.js";
  ```

## Basic Example

Points can be consumed by IP address, user ID, authorisation token, API route or any other string.

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

The Promise's `resolve` and `reject` callbacks both return an instance of the `RateLimiterRes` class if there is no error.
Object attributes:
```javascript
RateLimiterRes = {
    msBeforeNext: 250, // Number of milliseconds before next action can be done
    remainingPoints: 0, // Number of remaining points in current duration 
    consumedPoints: 5, // Number of consumed points in current duration 
    isFirstInDuration: false, // action is first in current duration 
}
```

You may want to set HTTP headers for the response:
```javascript
const headers = {
  "Retry-After": rateLimiterRes.msBeforeNext / 1000,
  "X-RateLimit-Limit": opts.points,
  "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
  "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)
}
```

### Advantages:
* no race conditions
* no production dependencies
* TypeScript declaration bundled
* Block Strategy against really powerful DDoS attacks (like 100k requests per sec) [Read about it and benchmarking here](https://github.com/animir/node-rate-limiter-flexible/wiki/In-memory-Block-Strategy)
* Insurance Strategy as emergency solution if database/store is down [Read about Insurance Strategy here](https://github.com/animir/node-rate-limiter-flexible/wiki/Insurance-Strategy)
* works in Cluster or PM2 without additional software [See RateLimiterCluster benchmark and detailed description here](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster)
* useful `get`, `set`, `block`, `delete`, `penalty` and `reward` methods

Full documentation is on [Wiki](https://github.com/animir/node-rate-limiter-flexible/wiki)

### Middlewares, plugins and other packages
* [Express middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Express-Middleware)
* [Koa middleware](https://github.com/animir/node-rate-limiter-flexible/wiki/Koa-Middleware)
* [Hapi plugin](https://github.com/animir/node-rate-limiter-flexible/wiki/Hapi-plugin)
* GraphQL [graphql-rate-limit-directive](https://www.npmjs.com/package/graphql-rate-limit-directive)
* NestJS [nestjs-rate-limiter](https://www.npmjs.com/package/nestjs-rate-limiter)
* Fastify based NestJS app try [nestjs-fastify-rate-limiter](https://www.npmjs.com/package/nestjs-fastify-rate-limiter)

Some copy/paste examples on Wiki:
* [Minimal protection against password brute-force](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#minimal-protection-against-password-brute-force)
* [Login endpoint protection](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#login-endpoint-protection)
* [Apply Block Strategy](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#apply-in-memory-block-strategy-to-avoid-extra-requests-to-store)
* [Setup Insurance Strategy](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#setup-insurance-strategy-for-store-limiters)
* [Websocket connection prevent flooding](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#websocket-single-connection-prevent-flooding)
* [Dynamic block duration](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#dynamic-block-duration)
* [Authorized users specific limits](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#authorized-and-not-authorized-users)
* [Different limits for different parts of application](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#different-limits-for-different-parts-of-application)
* [Third-party API, crawler, bot rate limiting](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example#third-party-api-crawler-bot-rate-limiting)

### Migration from other packages
* [express-brute](https://github.com/animir/node-rate-limiter-flexible/wiki/ExpressBrute-migration) Bonus: race conditions fixed, prod deps removed
* [limiter](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterQueue#migration-from-limiter) Bonus: multi-server support, respects queue order, native promises

### Docs and Examples

* [Options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options)
* [API methods](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods)

* [Drizzle](https://github.com/animir/node-rate-limiter-flexible/wiki/Drizzle)
* [DynamoDb](https://github.com/animir/node-rate-limiter-flexible/wiki/DynamoDB)
* [Etcd](https://github.com/animir/node-rate-limiter-flexible/wiki/Etcd)
* [Memcached](https://github.com/animir/node-rate-limiter-flexible/wiki/Memcache)
* [Memory](https://github.com/animir/node-rate-limiter-flexible/wiki/Memory)
* [Mongo](https://github.com/animir/node-rate-limiter-flexible/wiki/Mongo) (with [sharding support](https://github.com/animir/node-rate-limiter-flexible/wiki/Mongo#mongodb-sharding-options))
* [MySQL](https://github.com/animir/node-rate-limiter-flexible/wiki/MySQL) (support Sequelize and Knex)
* [Postgres](https://github.com/animir/node-rate-limiter-flexible/wiki/PostgreSQL) (support Sequelize, TypeORM and Knex)
* [Prisma](https://github.com/animir/node-rate-limiter-flexible/wiki/Prisma)
* [Redis](https://github.com/animir/node-rate-limiter-flexible/wiki/Redis)
* [SQLite](https://github.com/animir/node-rate-limiter-flexible/wiki/SQLite)
* Valkey: [iovalkey](https://github.com/animir/node-rate-limiter-flexible/wiki/IoValkey) or [ValkeyGlide](https://github.com/animir/node-rate-limiter-flexible/wiki/Valkey-Glide)
* [RateLimiterCluster](https://github.com/animir/node-rate-limiter-flexible/wiki/Cluster) ([PM2 cluster docs read here](https://github.com/animir/node-rate-limiter-flexible/wiki/PM2-cluster))
* [BurstyRateLimiter](https://github.com/animir/node-rate-limiter-flexible/wiki/BurstyRateLimiter) Traffic burst support
* [RateLimiterUnion](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterUnion) Combine 2 or more limiters to act as single
* [RLWrapperBlackAndWhite](https://github.com/animir/node-rate-limiter-flexible/wiki/Black-and-White-lists) Black and White lists
* [RateLimiterQueue](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterQueue) Rate limiter with FIFO queue
* [AWS SDK v3 Client Rate Limiter](https://github.com/animir/node-rate-limiter-flexible/wiki/AWS-SDK-v3-Client-Rate-Limiter) Prevent punishing rate limit.

### Changelog

See [releases](https://github.com/animir/node-rate-limiter-flexible/releases) for detailed changelog.

## Basic Options

* **points** 
    
    `Default: 4` 
    
    Maximum number of points that can be consumed over duration

* **duration** 

    `Default: 1` 
    
    Number of seconds before consumed points are reset.
    
    Points are never reset if `duration` is set to 0.

* **storeClient** 

    `Required for store limiters` 

    Must be `@valkey/valkey-glide`, `iovalkey`, `redis`, `ioredis`, `memcached`, `mongodb`, `pg`, `mysql2`, `mysql` or any other related pool or connection.

### Other options on Wiki:
* [keyPrefix](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#keyprefix) Make keys unique among different limiters.
* [blockDuration](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#blockduration) Block for N seconds, if consumed more than points.
* [inMemoryBlockOnConsumed](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#inmemoryblockonconsumed) Avoid extra requests to store.
* [inMemoryBlockDuration](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#inmemoryblockduration)
* [insuranceLimiter](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#insurancelimiter) Make it more stable with less efforts.
* [storeType](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#storetype) Have to be set to `knex`, if you use it.
* [dbName](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#dbname) Where to store points.
* [tableName](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#tablename) Table/collection.
* [tableCreated](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#tablecreated) Is table already created in MySQL, SQLite or PostgreSQL.
* [clearExpiredByTimeout](https://github.com/animir/node-rate-limiter-flexible/wiki/Options#clearexpiredbytimeout) For MySQL, SQLite and PostgreSQL.

See [full list of options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options).

## API

Read detailed description on Wiki.

* [consume(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterconsumekey-points--1) Consume points by key.
* [get(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimitergetkey) Get `RateLimiterRes` or `null`.
* [set(key, points, secDuration)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimitersetkey-points-secduration) Set points by key.
* [block(key, secDuration)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterblockkey-secduration) Block key for `secDuration` seconds.
* [delete(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterdeletekey) Reset consumed points.
* [deleteInMemoryBlockedAll](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterdeleteinmemoryblockedall)
* [penalty(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterpenaltykey-points--1) Increase number of consumed points in current duration.
* [reward(key, points = 1)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimiterrewardkey-points--1) Decrease number of consumed points in current duration.
* [getKey(key)](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods#ratelimitergetkeykey) Get internal prefixed key.

## Contributions

Appreciated, feel free!

Make sure you've launched `npm run eslint` before creating PR, all errors have to be fixed.

You can try to run `npm run eslint-fix` to fix some issues.

Any new limiter with storage must be extended from `RateLimiterStoreAbstract`.
It has to implement 4 methods:
* `_getRateLimiterRes` parses raw data from store to `RateLimiterRes` object.
* `_upsert` may be atomic or non-atomic upsert (increment). It inserts or updates the value by key and returns raw data. 
    If it doesn't make an atomic upsert (increment), the class should be suffixed with `NonAtomic`, e.g. `RateLimiterRedisNonAtomic`. 
    
    It must support `forceExpire` mode to overwrite key expiration time.
* `_get` returns raw data by key or `null` if there is no key.
* `_delete` deletes all key-related data and returns `true` on deleted, `false` if key is not found.

All other methods depends on the store. See `RateLimiterRedis` or `RateLimiterPostgres` for examples.

Note: all changes should be covered by tests.
