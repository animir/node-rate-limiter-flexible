[![Build Status](https://travis-ci.org/animir/node-rate-limiter-flexible.png)](https://travis-ci.org/animir/node-rate-limiter-flexible)
[![Coverage Status](https://coveralls.io/repos/animir/node-rate-limiter-flexible/badge.svg?branch=master)](https://coveralls.io/r/animir/node-rate-limiter-flexible?branch=master)

## node-rate-limiter-flexible

Flexible rate limiter with Redis as broker allows to control requests rate in cluster or distributed environment.
Backed on native Promises. 

It uses fixed window to limit requests.

Actions can be done evenly over duration window to cut off picks

## Installation

`npm i rate-limiter-flexible`

## Usage

Redis client must be created with offline queue switched off

```javascript
const redis = require('redis');
const { RateLimiter } = require('rate-limiter-flexible');

const redisClient = redis.createClient({ enable_offline_queue: false });

// It is recommended to process Redis errors and setup some reconnection strategy
redisClient.on('error', (err) => {
  
});

const opts = {
  points: 5, // Number of points
  duration: 5, // Per second(s)
  execEvenly: false
};

const rateLimiter = new RateLimiter(redisClient, opts);

rateLimiter.consume(remoteAddress)
    .then(() => {
      // ... Some app logic here ...
      
      // Depending on results it allows to fine
      rateLimiter.penalty(remoteAddress, 3);
      // or rise number of points for current duration
      rateLimiter.reward(remoteAddress, 2);
    })
    .catch((rejRes) => {
      if (rejRes instanceof Error) {
        // Some Redis error
        // Decide what to do with it on your own
      } else {
        // Can't consume
        // If there is no error, rateLimiter promise rejected with number of ms before next request allowed
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).send('Too Many Requests');
      }
    });
```

## Options

* `points` `Default: 4` Maximum number of points can be consumed over duration
* `duration` `Default: 1` Number of seconds before points are reset 
* `execEvenly` `Default: false` Delay action to be executed evenly over duration
First action in duration is executed without delay.
All next allowed actions in current duration are delayed by formula `msBeforeDurationEnd / (remainingPoints + 2)`
It allows to cut off load peaks.
Note: it isn't recommended to use it for long duration, as it may delay action for too long

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
* rejected when some Redis error happened, where reject reason `rejRes` is Error object
* rejected when there is no points to be consumed, where reject reason `rejRes` is `RateLimiterRes` object

Arguments:
* `key` is usually IP address or some unique client id
* `points` number of points consumed. `default: 1`

### rateLimiter.penalty(key, points = 1)

Fine `key` by `points` number of points.

Note: Depending on time penalty may go to next durations

Returns Promise

### rateLimiter.reward(key, points = 1)

Reward `key` by `points` number of points.

Note: Depending on time reward may go to next durations

Returns Promise
