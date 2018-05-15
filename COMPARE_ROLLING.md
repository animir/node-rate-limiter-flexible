## Compare fixed window with rolling window

**tl;dr** Fixed window algorithm used in [rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) 
**14x faster** on high traffic than the fastest Rolling window

The same benchmarking setting for all tests:

`bombardier -c 1000 -l -d 30s -r 2000 -t 1s http://127.0.0.1:3000/endpoint`

* 1000 concurrent requests
* test duration is 30 seconds
* not more than 2000 req/sec

3 libraries from github:
1. this one with fixed window
2. https://github.com/peterkhayes/rolling-rate-limiter
3. https://github.com/tj/node-ratelimiter
4. https://github.com/fastest963/node-redis-rolling-limit

There are [4 simple Express 4.x endpoints](https://github.com/animir/simple-express-endpoint-techtask/blob/test-rate-limiters/src/routes/pricing.js) 
limited by different libraries, 
which launched in `node:latest` and `redis:alpine` Docker containers by PM2 with 4 workers

Docker images are recreated before each test.

All limiters created with same rule: maximum 100 requests per 1 second
Key for every request is randomly generated number from 0 to 10

### rate-limiter-flexible
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1996.58     447.17    8002.31
  Latency       10.99ms    18.50ms   406.22ms
  Latency Distribution
     50%     6.39ms
     75%    10.07ms
     90%    21.44ms
     95%    33.62ms
     99%    74.38ms
  HTTP codes:
    1xx - 0, 2xx - 30000, 3xx - 0, 4xx - 29934, 5xx - 0
    others - 71
  Errors:
    the server closed connection before returning the first response byte. Make sure the server returns 'Connection: close' response header before closing the connection - 71
```

### rolling-rate-limiter
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2002.28    1004.72   25535.21
  Latency      281.73ms      2.01s     32.92s
  Latency Distribution
     50%    16.52ms
     75%    55.35ms
     90%   148.76ms
     95%   257.40ms
     99%      8.74s
  HTTP codes:
    1xx - 0, 2xx - 55206, 3xx - 0, 4xx - 1197, 5xx - 0
    others - 3530
  Errors:
    the server closed connection before returning the first response byte. Make sure the server returns 'Connection: close' response header before closing the connection - 3275
    dial tcp 127.0.0.1:3000: connect: operation timed out - 175
    dial tcp 127.0.0.1:3000: connect: connection reset by peer - 80
```

### ratelimiter

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      2021.58     995.59   22045.06
  Latency      219.30ms      1.81s     31.66s
  Latency Distribution
     50%    15.54ms
     75%    45.39ms
     90%   129.52ms
     95%   206.34ms
     99%      8.34s
  HTTP codes:
    1xx - 0, 2xx - 54628, 3xx - 0, 4xx - 1038, 5xx - 0
    others - 4226
  Errors:
    the server closed connection before returning the first response byte. Make sure the server returns 'Connection: close' response header before closing the connection - 3931
    dial tcp 127.0.0.1:3000: connect: connection reset by peer - 150
    dial tcp 127.0.0.1:3000: connect: operation timed out - 145
```

### redis-rolling-limit
```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1975.33     944.00   25855.43
  Latency      148.29ms      1.18s     29.00s
  Latency Distribution
     50%     8.39ms
     75%    26.26ms
     90%   114.73ms
     95%   214.40ms
     99%      2.84s
  HTTP codes:
    1xx - 0, 2xx - 56727, 3xx - 0, 4xx - 0, 5xx - 0
    others - 2274
  Errors:
    the server closed connection before returning the first response byte. Make sure the server returns 'Connection: close' response header before closing the connection - 2165
    dial tcp 127.0.0.1:3000: connect: connection reset by peer - 70
    dial tcp 127.0.0.1:3000: connect: operation timed out - 39
```

### Conclusion

Average latency
* `rate-limiter-flexible` 11ms
* `rolling-rate-limiter`  282ms
* `ratelimiter`           219ms
* `redis-rolling-limit`   148ms

It is obvious that fixed window is much-much faster