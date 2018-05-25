## RateLimiterCluster

### Benchmark

Endpoint is simple Express 4.x route launched in `node:latest` and `redis:alpine` Docker containers with 4 workers

Endpoint is limited by `RateLimiterCluster` with config:

```javascript
new RateLimiterCluster({
    points: 1000,
    duration: 1,
  });
```

By `bombardier -c 1000 -l -d 30s -r 2000 -t 5s http://127.0.0.1:3000/pricing`

Test with 1000 concurrent requests with maximum 2000 requests per sec during 30 seconds

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1997.87     429.40    3869.98
  Latency        4.75ms     3.32ms    68.21ms
  Latency Distribution
     50%     4.15ms
     75%     5.43ms
     90%     6.95ms
     95%     8.79ms
     99%    18.96ms
  HTTP codes:
    1xx - 0, 2xx - 15000, 3xx - 0, 4xx - 45014, 5xx - 0
```

It is a bit faster than RateLimiterRedis.

### How it works

RateLimiterClusterMaster must be created in master process.
It receives messages from workers by IPC.
It creates necessary message handler, which process messages only from specific channel `rate_limiter_flexible`.
So if you use IPC for something else, it doesn't break anything.

```javascript
const { RateLimiterClusterMaster } = require('rate-limiter-flexible');

if (cluster.isMaster) {
  new RateLimiterClusterMaster();
  cluster.fork();
} else {
  // ... your app ...
}
```

RateLimiterClusterMaster is Singleton.
It creates only one instance which process messages from all RateLimiterCluster created in workers.

RateLimiterCluster must be created with unique `keyPrefix`.
Every time RateLimiterCluster is created, it sends options to master. 
Master instance creates specific rate limiter by `keyPrefix` and sends `init` command to worker

So there is a time when worker can't process requests until master sends `init` to worker.
It takes several milliseconds.

Worker is protected from loosing requests while it is instantiated. 
It sets timer for 30 ms and waits `init` from master before processing requests


### Create several rate limiters

```javascript
  const rateLimiter1 = new RateLimiterCluster({
    keyPrefix: 'limiter1',
    points: 100,
    duration: 1,
  });

  const rateLimiter2 = new RateLimiterCluster({
    keyPrefix: 'limiter2',
    points: 10,
    duration: 1,
    execEvenly: true
  });
```

If the second `keyPrefix` is the same `limiter1`, master doesn't create the second limiter.
This results to unexpected behaviour, because options from the first limiter are used.

**`keyPrefix` must be unique, if different options required**