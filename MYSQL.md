## RateLimiterMySQL

Note: It isn't recommended to use it with more than 200-300 limited actions per second.

It supports `mysql2` and `mysql` node packages.

MySQL connection have to be created with allowed `multipleStatementes`.

By default, RateLimiterMySQL creates `rtlmtrflx` database and separate table by `keyPrefix` for every limiter.

To change database name set option `dbName`.

All limits are stored in one table if `tableName` option is set.

Limits data, which expired more than an hour ago, are removed every 5 minutes by `setTimeout`.

### Benchmark

Endpoint is pure NodeJS endpoint launched in `node:latest` and `mysql:5.7` Docker containers with 4 workers

Endpoint is limited by `RateLimiterMySQL` with config:

```javascript
new RateLimiterMySQL({
  storeClient: mysql,
  points: 20, // Number of points
  duration: 1, // Per second(s)
});
```

By `bombardier -c 500 -l -d 30s -r 1000 -t 5s http://127.0.0.1:3000`

Test with 500 concurrent requests with maximum 1000 requests per sec during 30 seconds

#### Single connection

```text
Statistics        Avg      Stdev        Max
  Reqs/sec       994.24     174.40    1562.24
  Latency       11.10ms     7.71ms    88.65ms
  Latency Distribution
     50%     8.00ms
     75%    14.09ms
     90%    22.66ms
     95%    28.47ms
     99%    43.90ms
  HTTP codes:
    1xx - 0, 2xx - 14967, 3xx - 0, 4xx - 15031, 5xx - 0
```

#### Connection pool 100

```text
Statistics        Avg      Stdev        Max
  Reqs/sec       995.90     305.88    6329.55
  Latency        6.96ms     8.64ms   165.23ms
  Latency Distribution
     50%     5.69ms
     75%     6.58ms
     90%     7.87ms
     95%     9.73ms
     99%    44.62ms
  HTTP codes:
    1xx - 0, 2xx - 27099, 3xx - 0, 4xx - 2884, 5xx - 0
```
