## RateLimiterCluster

### Benchmark

Endpoint is pure NodeJS endpoint launched in `node:10.5.0-jessie` Docker containers with 4 workers

Endpoint is limited by `RateLimiterCluster` with config:

```javascript
new RateLimiterCluster({
    points: 1000,
    duration: 1,
  });
```

By `bombardier -c 1000 -l -d 30s -r 2000 -t 5s http://127.0.0.1:8000`

Test with 1000 concurrent requests with maximum 2000 requests per sec during 30 seconds

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2024.57     234.52    2976.20
  Latency      704.58us   165.65us     7.05ms
  Latency Distribution
     50%   669.00us
     75%   843.00us
     90%     1.02ms
     95%     1.18ms
     99%     1.60ms
  HTTP codes:
    1xx - 0, 2xx - 53458, 3xx - 0, 4xx - 6560, 5xx - 0
```

Cluster limiter at least twice faster than RateLimiterRedis.

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