## RateLimiterMongo

RateLimiterMongo creates unique collection for each rate limiter `keyPrefix`.

### Benchmark

Endpoint is pure NodeJS endpoint launched in `node:10.5.0-jessie` and `mongo:3.6.5-jessie` Docker containers with 4 workers

Endpoint is limited by `RateLimiterMongo` with config:

```javascript
new RateLimiterMongo({
  mongo: mongo,
  points: 20, // Number of points
  duration: 1, // Per second(s)
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

### MongoDb options

MongoDb saves snapshots to disk with fsync and makes journaling by default.
It results to extra disk I/O.

If you already use MongoDb as data store and have high traffic like 1000 req/sec or more, you may find it useful to launch the second MongoDb instance with options:

```text
--syncdelay 0 : disable making snapshots to disk
--nojournal : disable journal
--wiredTigerCacheSizeGB 0.25 : set minimum memory
```

Builtin TTL index automatically deletes expired documents.
Document for one key is `68 bytes` in size. 
MongoDb stores information for about 4 million keys in 256Mb.

Here is a small test of MongoDb with different options:

It processes 10k, 100k and 250k writes for 10k random keys for:

#### MongoDB default settings

```text
10k  926ms
100k 4475ms
250k 13254ms
```

#### MongoDB fsync and journaling disabled

```text
10k  900ms
100k 4323ms
250k 12407ms
```

It is about 5% faster with disabled fsync and journaling, but avoiding extra disk I/O is worth.
