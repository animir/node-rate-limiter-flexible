## Insurance Strategy

Insurance Strategy allows to continue processing requests even if request to database / storage fails.

Insurance Strategy should be emergency solution, not stable infrastructure solution.
Automatic restart of database / storage have to be configured anyway.

Any store limiter like RateLimiterRedis, RateLimiterMongo, etc has an option `insuranceLimiter`, 
any limiter from this package can be setup as insurance limiter there.

Insurance limiter is used only when main limiter comes up with any error.

Main limiter is automatically active again, when error gone.

There is some period of time when consumed points are stored to insurance limiter. 
When main limiter store up and running, it may be empty or with outdated consumed points depending on store on config.

Data is NOT copied from insurance limiter to main limiter. It may result to extra actions allowed during errors on main store. 

### Usage

1. Make sure errors not thrown on store errors
2. Setup retry strategy depending on store and requirements
3. If `RateLimiterMemory` is used as insurance, it doesn't share limits between node processes.
It may block or allow some action depending on balancing approach. 
4. Any limiter `RateLimiterRedis`, `RateLimiterMongo` can be used as insurance

```javascript
const redis = require('redis');
const { RateLimiterRedis, RedisLimiterMemory } = require('rate-limiter-flexible');

const redisClient = redis.createClient({
  enable_offline_queue: false,
  retry_strategy: function (options) {
    if (options.attempt > 3) { // Try to reconnect 3 times
      // This error is caught by limiter and then insurance limiter is used in this case
      return new Error('Retry time exhausted');
    }

    return 100; // Not longer than 100 * 3 = 300 ms
  }
});

redisClient.on('error', (err) => {
  // Log error
});

const rateLimiterMemory = new RateLimiterMemory({
  points: 1, // if there are 5 workers
  duration: 1,
});

const rateLimiter = new RateLimiterRedis({
  redis: redisClient,
  points: 5,
  duration: 1,
  insuranceLimiter: rateLimiterMemory
});

  rateLimiter.consume(ip)
    .then((data) => {
      // Allowed
    })
    .catch((rej) => {
      // Blocked
    });

```


