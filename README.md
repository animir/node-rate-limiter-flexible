[![Build Status](https://travis-ci.org/animir/node-rate-limiter-flexible.png)](https://travis-ci.org/animir/node-rate-limiter-flexible)
[![Coverage Status](https://coveralls.io/repos/animir/node-rate-limiter-flexible/badge.svg?branch=master)](https://coveralls.io/r/animir/node-rate-limiter-flexible?branch=master)
[![npm version](https://badge.fury.io/js/rate-limiter-flexible.svg)](https://www.npmjs.com/package/rate-limiter-flexible)
[![node version][node-image]][node-url]

[node-image]: https://img.shields.io/badge/node.js-%3E=_6.0-green.svg?style=flat-square
[node-url]: http://nodejs.org/download/

<img src="rlflx-logo-small.png" width="50" alt="Logo"/>

## node-rate-limiter-flexible

Flexible rate limiter and anti-DDoS protector works in process 
_Memory_, _Cluster_, _MongoDB_, _MySQL_, _PostgreSQL_ or _Redis_ allows to control requests rate in single process or distributed environment. 

It uses **fixed window** as it is much faster than rolling window. 
[See comparative benchmarks with other libraries here](https://github.com/animir/node-rate-limiter-flexible/blob/master/COMPARE_ROLLING.md)

:star: It is **STAR**ving, don't forget to feed the beast! :star:

Advantages:
* in-memory block strategy against really powerful DDoS attacks (like 100k requests per sec) [Read about it and benchmarking here](https://github.com/animir/node-rate-limiter-flexible/blob/master/BLOCK_STRATEGY.md)
* backed on native Promises
* works in Cluster without additional software [See RateLimiterCluster benchmark and detailed description here](https://github.com/animir/node-rate-limiter-flexible/blob/master/CLUSTER.md)
* actions can be done evenly over duration window to cut off picks
* no race conditions
* covered by tests
* no prod dependencies
* database errors don't result to broken app if `insuranceLimiter` set up
* useful `block`, `penalty` and `reward` methods

### Links

* [RateLimiterRedis](#ratelimiterredis)
* [RateLimiterMongo](#ratelimitermongo)
* [RateLimiterMySQL](#ratelimitermysql)
* [RateLimiterPostgreSQL](https://github.com/animir/node-rate-limiter-flexible/blob/master/POSTGRES.md)
* [RateLimiterCluster](#ratelimitercluster)
* [RateLimiterMemory](#ratelimitermemory)
* [RateLimiterUnion](#ratelimiterunion) Combine 2 or more limiters to act as single
* [Express middleware](#express-middleware)
* [Koa middleware](#koa-middleware)
* [Options](#options)
* [API](#api)

### Benchmark

Average latency during test pure NodeJS endpoint in cluster of 4 workers with everything set up on one server by 

1000 concurrent clients with maximum 2000 requests per sec during 30 seconds.

```text
1. Memory   0.34 ms
2. Cluster  0.69 ms
3. Redis    2.45 ms
4. Mongo    4.75 ms
```

500 concurrent clients with maximum 1000 req per sec during 30 seconds
```text
5. MySQL      6.96 ms (with connection pool 100)
6. PostgreSQL 8.44 ms (with connection pool)
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
It allows to cut off load peaks.
Note: it isn't recommended to use it for long duration, as it may delay action for too long

* `blockDuration` `Default: 0` If positive number and consumed more than points in current duration, 
block for `blockDuration` seconds. 

#### Options specific to Redis, Mongo, MySQL, PostgreSQL

* `inmemoryBlockOnConsumed` `Default: 0` Against DDoS attacks. Blocked key isn't checked by requesting Redis, MySQL or Mongo.
In-memory blocking works in **current process memory**. 
Any database or key-value storage may be significantly slowed down on dozens of thousands requests.

* `inmemoryBlockDuration` `Default: 0` Block key for `inmemoryBlockDuration` seconds, 
if `inmemoryBlockOnConsumed` or more points are consumed 

* `insuranceLimiter` `Default: undefined` Instance of RateLimiterAbstract extended object to store limits, 
when database comes up with any error. 

    All data from `insuranceLimiter` is NOT copied to parent limiter, when error gone

    **Note:** `insuranceLimiter` automatically setup `blockDuration` and `execEvenly` 
to same values as in parent to avoid unexpected behaviour

#### Options specific to MySQL and PostgreSQL

* `storeClient` `Required` Have to be `pg`, `mysql2` or `mysql` pool or connection

* `tableName` `Default: equals to 'keyPrefix' option` By default, limiter creates table for each unique `keyPrefix`. 
All limits for all limiters are stored in one table if custom name is set.

#### Options specific to MySQL

* `dbName` `Default: 'rtlmtrflx'` Database where limits are stored. It is created during creating a limiter

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
  redis: redisClient,
  points: 5, // Number of points
  duration: 5, // Per second(s)
  
  // Custom
  execEvenly: false, // Do not delay actions evenly
  blockDuration: 0, // Do not block if consumed more than points
  keyPrefix: 'rlflx', // must be unique for limiters with different purpose
  
  // Database limiters specific
  inmemoryBlockOnConsumed: 10, // If 10 points consumed in current duration
  inmemoryBlockDuration: 30, // block for 30 seconds in current process memory
  insuranceLimiter: new RateLimiterMemory(
    // It will be used only on database error as insurance
    // Can be any implemented limiter like RateLimiterMemory or RateLimiterRedis extended from RateLimiterAbstract
    {
      points: 1, // 1 is fair if you have 5 workers and 1 cluster
      duration: 5,
      execEvenly: false,
    })
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

Endpoint is pure NodeJS endpoint launched in `node:latest` and `redis:alpine` Docker containers by PM2 with 4 workers

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

### RateLimiterMongo

MongoDB >=3.2

It supports `mongodb` native and `mongoose` packages
[See RateLimiterMongo benchmark here](https://github.com/animir/node-rate-limiter-flexible/blob/master/MONGO.md)

```javascript
const { RateLimiterMongo } = require('rate-limiter-flexible');
const mongoose = require('mongoose');

const mongoOpts = {
  reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
  reconnectInterval: 100, // Reconnect every 100ms
};

mongoose.connect('mongodb://127.0.0.1:27017/' + RateLimiterMongo.getDbName())
  .catch((err) => {});
const mongoConn = mongoose.connection;
// Or
const mongoConn = mongoose.createConnection('mongodb://127.0.0.1:27017/' + RateLimiterMongo.getDbName(), mongoOpts);

const opts = {
  mongo: mongoConn,
  points: 10, // Number of points
  duration: 1, // Per second(s)
};
  
const rateLimiterMongo = new RateLimiterMongo(opts);
    // Usage is the same as for RateLimiterRedis


/* --- Or with native mongodb package --- */

const { MongoClient } = require('mongodb');

const mongoOpts = {
  useNewUrlParser: true,
  reconnectTries: Number.MAX_VALUE, // Never stop trying to reconnect
  reconnectInterval: 100, // Reconnect every 100ms
};

const mongoConn = MongoClient.connect(
  'mongodb://localhost:27017',
  mongoOpts
);

const opts = {
  mongo: mongoConn,
  points: 10, // Number of points
  duration: 1, // Per second(s)
};

const rateLimiterMongo = new RateLimiterMongo(opts);
    // Usage is the same as for RateLimiterRedis
```

Connection to Mongo takes milliseconds, so any method of rate limiter is rejected with Error, until connection established

`insuranceLimiter` can be setup to avoid errors, but all changes won't be written from `insuranceLimiter` to `RateLimiterMongo` when connection established

### RateLimiterMySQL

It supports `mysql2` and `mysql` node packages.

MySQL connection have to be created with allowed `multipleStatementes`.

Limits data, which expired more than an hour ago, are removed every 5 minutes by `setTimeout`.

[Read more about RateLimiterMySQL here](https://github.com/animir/node-rate-limiter-flexible/blob/master/MYSQL.md)

```javascript
  const mysql = require('mysql2');
  const client = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : 'secret',
    multipleStatements: true // it is required by limiter
  });

  const opts = {
    storeClient: client,
    dbName: 'mydb',
    tableName: 'mytable', // all limiters store data in one table
    points: 5, // Number of points
    duration: 1, // Per second(s)
  };

  const rateLimiter = new RateLimiterMySQL(opts);
    // Usage is the same as for RateLimiterRedis
```

Connection to MySQL takes milliseconds, so any method of rate limiter is rejected with Error, until connection is established

### RateLimiterCluster

Note: it doesn't work with PM2 yet

RateLimiterCluster performs limiting using IPC. 
Each request is sent to master process, which handles all the limits, then master send results back to worker.

[See RateLimiterCluster benchmark and detailed description here](https://github.com/animir/node-rate-limiter-flexible/blob/master/CLUSTER.md)

```javascript
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const { RateLimiterClusterMaster, RateLimiterCluster } = require('rate-limiter-flexible');

if (cluster.isMaster) {
  // Doesn't require any options, it is only storage and messages handler
  new RateLimiterClusterMaster();

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
} else {
  const rateLimiter = new RateLimiterCluster({
    keyPrefix: 'myclusterlimiter', // Must be unique for each limiter
    points: 100,
    duration: 1,
    timeoutMs: 3000 // Promise is rejected, if master doesn't answer for 3 secs
  });
  
  // Usage is the same as for RateLimiterRedis
}  
    
```

### RateLimiterMemory

It manages limits in **current process memory**, so keep it in mind when use it in cluster

```javascript
const rateLimiter = new RateLimiterMemory(
{
  keyPrefix: 'rlflx',
  points: 1, // 1 is fair if you have 5 workers and 1 cluster, all workers will limit it to 5 in sum
  duration: 5,
  execEvenly: false,
});
    
// Usage is the same as for RateLimiterRedis
// Except: it never rejects Promise with Error    
    
```

### RateLimiterUnion

Combine 2 or more rate limiters to act as single

Any rate limiters from this `rate-limiter-flexible` can be united

Useful for authorization, which must be protected from password brute force

For example, not more than once per second and only 5 points per minute

`keyPrefix` is necessary as resolved and rejected results depend on it

```javascript
const limiter1 = new RateLimiterMemory({
  keyPrefix: 'limit1',
  points: 1,
  duration: 1,
});
const limiter2 = new RateLimiterMemory({
  keyPrefix: 'limit2',
  points: 5,
  duration: 60,
});
const rateLimiterUnion = new RateLimiterUnion(limiter1, limiter2);

rateLimiterUnion.consume(remoteAddress)
  .then((res) => {
    // Returns object with 2 RateLimiterRes objects
    res['limit1'].remainingPoints;
    res['limit2'].remainingPoints;
  })
  .catch((rej) => {
    /* Returns object with RateLimiterRes objects only for rejected limiters
    * For example:
    * { limit1: RateLimiterRes { ... } }
    * 
    * It may be Error if you use any limiter without insurance except Memory 
    * { limit2: Error }
    */
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

## Contribution

Make sure you've launched `npm run eslint` before creating PR, all errors have to be fixed.

You can try to run `npm run eslint-fix` to fix some issues.

Appreciated, feel free!
