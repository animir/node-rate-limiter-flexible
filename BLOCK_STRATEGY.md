## In-memory Block Strategy

In-memory Block Strategy is against DDoS attacks.
Redis is quite fast. It can process over 100k requests per second.
However, performance still depends on amount of requests per second.

We don't want latency to become 3, 5 or more seconds.
Any limiter like Redis or Mongo extended from RateLimiterStoreAbstract provides a block strategy to avoid too many requests to Store during DDoS attack.

It can be activated with setup `inmemoryBlockOnConsumed` and `inmemoryBlockDuration` options.
If some actions consume `inmemoryBlockOnConsumed` points, RateLimiterRedis starts using **current process memory** for them
All blocked actions with certain key don't request Redis anymore until block expires.

Note for distributed apps: DDoS requests still can go to Store if not all NodeJS workers blocked appropriate keys.
Anyway, it allows to avoid over load of Store

In-memory Block strategy algorithm developed with specificity rate limiter in mind:
* it doesn't use `setTimeout` to expire blocked keys, so doesn't overload Event Loop
* blocked keys expired in two cases:
    1. if `key` is blocked, it launches collect of expired blocked keys. 
    So it slows down only already blocked actions.
    1. on adding a new blocked `key`, when there are more than 999 blocked keys in total.


### Benchmark 

There is simple Express 4.x endpoint, 
which launched in `node:10.5.0-jessie` and `redis:4.0.10-alpine` Docker containers by PM2 with 4 workers
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



#### Without In-memory Block Strategy

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
  Reqs/sec      1999.05     562.96   11243.01
  Latency        7.29ms     8.71ms   146.95ms
  Latency Distribution
     50%     5.25ms
     75%     7.20ms
     90%    11.61ms
     95%    18.73ms
     99%    52.78ms
  HTTP codes:
    1xx - 0, 2xx - 750, 3xx - 0, 4xx - 59261, 5xx - 0
```

#### Setup In-memory Block Strategy

5 points per second to consume

Block action for 30 seconds, if 10 or more points consumed in current duration

```javascript
const rateLimiter = new RateLimiterRedis(
  {
    redis: redisClient,
    points: 5,
    duration: 1,
    inmemoryBlockOnConsumed: 10,
    inmemoryBlockDuration: 30,
  },
);
```

Result:
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2002.56     773.42   11058.44
  Latency        5.19ms    10.30ms   149.12ms
  Latency Distribution
     50%     2.99ms
     75%     4.08ms
     90%     5.86ms
     95%    14.35ms
     99%    60.55ms
  HTTP codes:
    1xx - 0, 2xx - 25, 3xx - 0, 4xx - 59920, 5xx - 0
```

#### Conclusion

* Latency is smaller with In-memory Block Strategy
* Number of requests to Redis less on 59k roughly
