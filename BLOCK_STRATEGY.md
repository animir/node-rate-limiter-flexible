## Block Strategy

Block strategy is against DDoS attacks.
Redis is quite fast. It can process over 100k requests per second.
However, performance still depends on amount of requests per second.

We don't want latency to become 3, 5 or more seconds.
RateLimiterRedis provides a block strategy to avoid too many requests to Redis during DDoS attack.

It can be activated with setup `blockOnPointsConsumed` and `blockDuration` options.
If some actions consume `blockOnPointsConsumed` points, RateLimiterRedis starts using **current process memory** for them
All blocked actions with certain key don't request Redis anymore until block expires.

Note for distributed apps: DDoS requests still can go to Redis if not all NodeJS workers blocked appropriate keys.
Anyway, it allows to avoid over load of Redis

Block strategy algorithm developed with specificity rate limiter in mind:
* it doesn't use `setTimeout` to expire blocked keys, so doesn't overload Event Loop
* blocked keys expired in two cases:
    1. if `key` is blocked, it launches collect of expired blocked keys. 
    So it slows down only already blocked actions.
    1. on adding a new blocked `key`, when there are more than 999 blocked keys in total.


### Benchmark 

There is simple Express 4.x endpoint, 
which launched in `node:latest` and `redis:alpine` Docker containers by PM2 with 4 workers
**Note:** Benchmark is done in local environment, so production will be much faster.

```javascript
router.get('/', (req, res, next) => {
  rateLimiter.consume((Math.floor(Math.random() * 5).toString()))
    .then(() => {
      res.status(200).json({}).end();
    })
    .catch(() => {
      res.status(429).send('Too Many Requests').end();
    });
});
```

It creates 5 random keys. 

It isn't real situation, 
but purpose is to show latency and calculate how it helps to avoid too many requests to Redis.

The same benchmarking setting for both tests:

`bombardier -c 1000 -l -d 30s -r 2000 -t 1s http://127.0.0.1:3000`

* 1000 concurrent requests
* test duration is 30 seconds
* not more than 2000 req/sec



#### Without Block Strategy

5 points per second to consume

```javascript
const rateLimiter = new RateLimiterRedis(
  {
    redis: redisClient,
    points: 5,
    duration: 1,
  },
);
```

Result:
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2006.80     745.77   18495.21
  Latency       25.99ms   167.75ms      5.10s
  Latency Distribution
     50%     6.55ms
     75%    10.62ms
     90%    29.05ms
     95%    66.24ms
     99%   195.91ms
  HTTP codes:
    1xx - 0, 2xx - 750, 3xx - 0, 4xx - 58675, 5xx - 0
```

#### Setup Block Strategy

5 points per second to consume

Block action for 30 seconds, if 10 or more points consumed in current duration

```javascript
const rateLimiter = new RateLimiterRedis(
  {
    redis: redisClient,
    points: 5,
    duration: 1,
    blockOnPointsConsumed: 10,
    blockDuration: 30,
  },
);
```

Result:
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1995.36     598.72   10464.86
  Latency       13.23ms    71.15ms      1.78s
  Latency Distribution
     50%     4.36ms
     75%     6.76ms
     90%    17.60ms
     95%    41.47ms
     99%   106.19ms
  HTTP codes:
    1xx - 0, 2xx - 25, 3xx - 0, 4xx - 59600, 5xx - 0
```

#### Conclusion

* Reqs/sec is the same for both in average
* Latency is smaller with Block Strategy. 
It will be same or larger for Block Strategy depending amount of different keys
* Number of requests to Redis less on 58k roughly