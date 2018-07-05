## RateLimiterMySQL

It supports `mysql2`, `mysql`, `sequilize` and `knex`.

**Note**: It takes 50-150 ms per request on more than 1000 concurrent requests per second

By default, RateLimiterMySQL creates `rtlmtrflx` database and separate table by `keyPrefix` for every limiter.

To change database name set option `dbName`.

All limits are stored in one table if `tableName` option is set.

`RateLimiterMySQL` throws error on limiter creation, if database or table can NOT be created.

Limits data, which expired more than an hour ago, are removed every 5 minutes by `setTimeout`.

Connection to MySQL takes milliseconds, so any method of rate limiter is rejected with Error, until connection is established

It is recommended to provide `ready` callback as the second option of ` new RateLimiterMySQL(opts, ready)` 
to react on errors during creating database or table(s) for rate limiters. See example below.
`ready` callback can be omitted, if process is exit on unhandled errors.

### Usage

```javascript
const mysql = require('mysql2');
const {RateLimiterMySQL} = require('rate-limiter-flexible');

const pool = mysql.createPool({
  connectionLimit : 100,
  host: 'localhost',
  user: 'root',
  password: 'secret',
});

const opts = {
  storeClient: pool,
  dbName: 'mydb',
  tableName: 'mytable', // all limiters store data in one table
  points: 5, // Number of points
  duration: 1, // Per second(s)
};

const ready = (err) => {
  if (err) {
   // log or/and process exit 
  } else {
    // db and table checked/created
  }
};

// if second parameter is not a function or not provided, it may throw unhandled error on creation db or table
const rateLimiter = new RateLimiterMySQL(opts, ready);
rateLimiter.consume(key)
  .then((rateLimiterRes) => {
    // Allowed
  })
  .catch((rej) => {
    // Blocked
  });
```

#### Sequelize and Knex support

It gets internal connection from Sequelize or Knex to make raw queries.
Connection is released after any query or transaction, so workflow is clean.

```javascript
const rateLimiter = new RateLimiterMySQL({
      storeClient: sequelizeInstance,
}, ready);

const rateLimiter = new RateLimiterMySQL({
      storeClient: knexInstance,
      storeType: `knex`, // knex requires this option 
}, ready);
```

[See detailed options description here](https://github.com/animir/node-rate-limiter-flexible#options)

### Benchmark

Endpoint is pure NodeJS endpoint launched in `node:10.5.0-jessie` and `mysql:5.7` Docker containers with 4 workers

Endpoint is limited by `RateLimiterMySQL` with config for 500 random keys:

```javascript
new RateLimiterMySQL({
  storeClient: mysql,
  points: 4, // Number of points
  duration: 1, // Per second(s)
});
```

By `bombardier -c 500 -l -d 30s -r 1000 -t 5s http://127.0.0.1:3000`

Test with 500 concurrent requests with maximum 1000 requests per sec during 30 seconds

#### Single connection

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1000.96     250.22    2171.97
  Latency       20.88ms    17.01ms   141.73ms
  Latency Distribution
     50%    12.94ms
     75%    28.33ms
     90%    48.01ms
     95%    59.89ms
     99%    85.00ms
  HTTP codes:
    1xx - 0, 2xx - 24684, 3xx - 0, 4xx - 5322, 5xx - 0
```

#### Connection pool 100

```text
Statistics        Avg      Stdev        Max
  Reqs/sec      1002.28     299.86    2669.58
  Latency       14.59ms     6.13ms   102.96ms
  Latency Distribution
     50%    12.91ms
     75%    16.84ms
     90%    20.58ms
     95%    25.60ms
     99%    38.66ms
  HTTP codes:
    1xx - 0, 2xx - 24647, 3xx - 0, 4xx - 5357, 5xx - 0
```
