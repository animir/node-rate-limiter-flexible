## node-rate-limiter-flexible

Flexible rate limiter with Redis as broker allows to control requests rate in cluster or distributed environment.
Backed on native Promises
It uses fixed window to limit requests.

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
  limit: 5, // Number of request(s)
  duration: 5, // Per second(s)
};

const rateLimiter = new RateLimiter(redisClient, opts);

rateLimiter.consume(remoteAddress)
    .then(() => {
      // ... Some app logic here ...
      
      // Depending on results it allows to fine
      rateLimiter.penalty(remoteAddress, 3);
      // or rise limit by rewarding some points
      rateLimiter.reward(remoteAddress, 2);
    })
    .catch((err, msBeforeReset) => {
      if (err) {
        // Some Redis error
        // Decide what to do with it on your own
      } else {
        // Can't consume
        // If there is no error, rateLimiter promise rejected with number of ms before next request allowed
        const secs = Math.round(msBeforeReset / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).send('Too Many Requests');
      }
    });
```

## API

### rateLimiter.consume(key, rate)

Returns Promise, which: 
* resolved when point(s) is consumed, so action can be done
* rejected when some Redis error happened. Callback is `(err)`
* rejected when there is no points to be consumed. 
Callback is `(err, msBeforeReset)`, where `msBeforeReset` is number of ms before next allowed request

Arguments:
* `key` is usually IP address or some unique client id
* `rate` number of points consumed. `default: 1`

### rateLimiter.penalty(key, rate = 1)

Fine `key` by `rate` number of points.

Doesn't return anything

### rateLimiter.reward(key, rate = 1)

Reward `key` by `rate` number of points.

Doesn't return anything