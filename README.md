[![Build Status](https://travis-ci.org/animir/node-rate-limiter-flexible.png)](https://travis-ci.org/animir/node-rate-limiter-flexible)
[![Coverage Status](https://coveralls.io/repos/animir/node-rate-limiter-flexible/badge.svg?branch=master)](https://coveralls.io/r/animir/node-rate-limiter-flexible?branch=master)

## node-rate-limiter-flexible

Flexible rate limiter with Redis as broker allows to control requests rate in cluster or distributed environment. 

It uses fixed window to limit requests.

Advantages: 
* backed on native Promises
* actions can be done evenly over duration window to cut off picks
* no race conditions
* covered by tests
* no prod dependencies
* Redis errors don't result to broken app if `inMemoryLimiter` set up
* useful `penalty` and `reward` methods to change limits on some results of an action

### Benchmark

By `bombardier -c 1000 -l -d 10s -r 2500 -t 5s http://127.0.0.1:3000/pricing`

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2491.79     801.92    9497.25
  Latency        8.62ms    11.69ms   177.96ms
  Latency Distribution
     50%     5.41ms
     75%     7.65ms
     90%    15.07ms
     95%    27.24ms
     99%    70.85ms
  HTTP codes:
    1xx - 0, 2xx - 25025, 3xx - 0, 4xx - 0, 5xx - 0
    others - 0
```

Endpoint is simple Express 4.x route launched in `node:latest` and `redis:alpine` Docker containers by PM2 with 4 workers

Endpoint is limited by `RateLimiterRedis` with config:

```javascript
new RateLimiterRedis(
  {
    redis: redisClient,
    points: 1000,
    duration: 1,
  },
);
```


## Installation

`npm i rate-limiter-flexible`

## Usage

### RateLimiterRedis

Redis client must be created with offline queue switched off

```javascript
const redis = require('redis');
const { RateLimiterRedis, RateLimiterMemory } = require('rate-limiter-flexible');

const redisClient = redis.createClient({ enable_offline_queue: false });

// It is recommended to process Redis errors and setup some reconnection strategy
redisClient.on('error', (err) => {
  
});

const opts = {
  redis: redisClient,
  points: 5, // Number of points
  duration: 5, // Per second(s)
  execEvenly: false,
  inMemoryLimiter: new RateLimiterMemory( // It will be used only on Redis error as insurance
    {
      points: 1, // 1 is fair if you have 5 workers and 1 cluster
      duration: 5,
      execEvenly: false,
    })
};

const rateLimiterRedis = new RateLimiterRedis(opts);

rateLimiterRedis.consume(remoteAddress)
    .then(() => {
      // ... Some app logic here ...
      
      // Depending on results it allows to fine
      rateLimiterRedis.penalty(remoteAddress, 3);
      // or rise number of points for current duration
      rateLimiterRedis.reward(remoteAddress, 2);
    })
    .catch((rejRes) => {
      if (rejRes instanceof Error) {
        // Some Redis error
        // Never happen if `inMemoryLimiter` set up
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

### RateLimiterMemory

It manages limits in **current process memory**, so keep it in mind when use it in cluster

```javascript
const rateLimiter = new RateLimiterMemory( // It will be used only on Redis error as insurance
{
  points: 1, // 1 is fair if you have 5 workers and 1 cluster
  duration: 5,
  execEvenly: false,
});
    
// Usage is the same as for RateLimiterRedis
// Except: it never rejects Promise with Error    
    
```

## Options

* `points` `Default: 4` Maximum number of points can be consumed over duration
* `duration` `Default: 1` Number of seconds before points are reset 
* `execEvenly` `Default: false` Delay action to be executed evenly over duration
First action in duration is executed without delay.
All next allowed actions in current duration are delayed by formula `msBeforeDurationEnd / (remainingPoints + 2)`
It allows to cut off load peaks.
Note: it isn't recommended to use it for long duration, as it may delay action for too long
* `inMemoryLimiter` `Default: undefined` RateLimiterMemory object to store limits in process memory, when Redis comes up with any error.
Be careful when use it in cluster or in distributed app.
It may result to floating number of allowed actions. 
If an action with a same `key` is launched on one worker several times in sequence, limiter will reach out of points soon. 
Omit it if you want strictly use Redis and deal with errors from it


## API

### RateLimiterRes object

Both Promise resolve and reject returns object of `RateLimiterRes` class if there is no any error.
Object attributes:
```javascript
RateLimiterRes = {
    msBeforeNext: 250, // Number of milliseconds before next action can be done
    remainingPoints: 0 // Number of remaining points in current duration 
}
````

### rateLimiter.consume(key, points = 1)

Returns Promise, which: 
* resolved when point(s) is consumed, so action can be done
* only for RateLimiterRedis: rejected when some Redis error happened, where reject reason `rejRes` is Error object
* rejected when there is no points to be consumed, where reject reason `rejRes` is `RateLimiterRes` object

Arguments:
* `key` is usually IP address or some unique client id
* `points` number of points consumed. `default: 1`

### rateLimiter.penalty(key, points = 1)

Fine `key` by `points` number of points for **one duration**.

Note: Depending on time penalty may go to next durations

Returns Promise

### rateLimiter.reward(key, points = 1)

Reward `key` by `points` number of points for **one duration**.

Note: Depending on time reward may go to next durations

Returns Promise
