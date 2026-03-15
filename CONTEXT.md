
# rate-limiter-flexible

Comprehensive reference for the `rate-limiter-flexible` npm package — atomic and non-atomic counters and rate limiting tools for Node.js, Deno, and browsers (Memory limiter).
Harden application security against brute-force and DoS attacks.

Sources: [README](https://github.com/animir/node-rate-limiter-flexible) · [Wiki](https://github.com/animir/node-rate-limiter-flexible/wiki)

## Installation & Import

```bash
npm i --save rate-limiter-flexible
# or
yarn add rate-limiter-flexible
```

```js
// ESM (recommended)
import { RateLimiterMemory } from "rate-limiter-flexible";

// Direct import (tree-shakeable)
import RateLimiterMemory from "rate-limiter-flexible/lib/RateLimiterMemory.js";

// CommonJS
const { RateLimiterMemory } = require("rate-limiter-flexible");
```

**TypeScript:** Types are bundled in `types.d.ts`. Since v8.0.0, `RateLimiterQueueError` must be imported from defaults: `import { RateLimiterQueueError } from "rate-limiter-flexible"`.

## Core Concepts

- **Atomic increments** — all operations use atomic increments to prevent race conditions.
- **Fixed window** algorithm — much faster than rolling window. See [comparative benchmarks](https://github.com/animir/node-rate-limiter-flexible/wiki/Comparative-benchmarks).
- **Zero production dependencies.**
- **Deno compatible** — see [example gist](https://gist.github.com/animir/d06ca92931677f330d3f2d4c6c3108e4).
- **Browser compatible** — `RateLimiterMemory` works in the browser.
- **Unified API** — all limiters (Memory, Redis, Mongo, etc.) share the same interface. Pick a store, configure options, consume points by key (IP, user ID, token, route, any string).
- Speed up any store limiter with `inMemoryBlockOnConsumed` option.

## Options Reference

Options can be changed at runtime: `rateLimiter.points = 50`, `rateLimiter.duration = 5`.

### Common Options

| Option | Default | Description |
|--------|---------|-------------|
| `points` | **Required** | Max points consumable over `duration`. Must be a number. |
| `duration` | **Required** | Seconds before points reset (from first consume). Must be >= 0. `0` = never expire. |
| `keyPrefix` | `'rlflx'` | Unique prefix per limiter to avoid key collisions. For some stores, used as table/collection name. |
| `blockDuration` | `0` | If >0, block key for this many seconds once points exhausted. |
| `storeClient` | — | Required for store limiters. Accepts `@valkey/valkey-glide`, `iovalkey`, `redis`, `ioredis`, `memcached`, `mongodb`, `pg`, `mysql2`, `mysql`, Sequelize, TypeORM, Knex, or any related pool/connection. |
| `inMemoryBlockOnConsumed` | `0` | Block key in process memory after this many points consumed (DoS protection). Should be >= `points`. |
| `inMemoryBlockDuration` | `0` | Seconds to block in memory. Set same as `blockDuration` for consistency across processes. |
| `insuranceLimiter` | `undefined` | Fallback limiter instance used when store errors occur. |
| `execEvenly` | `false` | Delay actions evenly over duration (Leaky Bucket pattern). |
| `execEvenlyMinDelayMs` | `duration * 1000 / points` | Minimum delay when `execEvenly` is true. |
| `clearExpiredByTimeout` | `true` | (MySQL, SQLite, PostgreSQL) Auto-delete expired data every 5 min. |
| `tableCreated` | `false` | (MySQL, PostgreSQL, SQLite, DynamoDB) Skip table creation if already exists. |
| `tableName` | `keyPrefix` | (MongoDB, MySQL, PostgreSQL, SQLite) Custom table/collection name. |
| `dbName` | varies | Database name (MySQL: `'rtlmtrflx'`, MongoDB: `'node-rate-limiter-flexible'`). |

### Store-Specific Options

**Redis:**
- `rejectIfRedisNotReady` (default `false`) — reject immediately when Redis not ready.
- `customIncrTtlLuaScript` — custom Lua script for increments.
- `useRedisPackage` (default `false`) — set `true` for `redis` package v4+.
- `useRedis3AndLowerPackage` (default `false`) — for `redis` package v3 or lower (not fully supported).

**MongoDB:**
- `indexKeyPrefix` (default `{}`) — combined index attributes.
- `disableIndexesCreation` (default `false`) — disable auto-index creation; call `await limiter.createIndexes()` manually.

**PostgreSQL:**
- `schemaName` — custom schema (default: `public`).

**DynamoDB:**
- `dynamoTableOpts` (default `{readCapacityUnits: 25, writeCapacityUnits: 25}`).
- `ttlSet` (default `false`) — skip TTL check on instantiation (useful for serverless).

**Drizzle:**
- `schema` — required pgTable definition.

**Cluster:**
- `timeoutMs` (default `5000`) — IPC timeout between worker and master.

**Storedb type:**
- `storeType` — for Knex set to `'knex'`; for SQLite set to `'better-sqlite3'` or `'knex'`.

## API Methods

All methods return Promises.

| Method | Description |
|--------|-------------|
| `consume(key, points = 1, options = {})` | Consume points. Resolves with `RateLimiterRes`, rejects when limit reached. |
| `get(key)` | Get current `RateLimiterRes` for key without consuming. Returns `null` if no record. |
| `set(key, points, secDuration)` | Set consumed points and duration for a key. |
| `block(key, secDuration)` | Block key for `secDuration` seconds. |
| `delete(key)` | Delete key and return `true`/`false`. |
| `deleteInMemoryBlockedAll()` | Clear all in-memory blocked keys. |
| `penalty(key, points = 1)` | Add penalty points (same as consume but semantic). |
| `reward(key, points = 1)` | Subtract points (reward good behavior). |
| `getKey(key)` | Get internal key with prefix applied. |

### RateLimiterRes Object

| Property | Description |
|----------|-------------|
| `msBeforeNext` | Milliseconds before points reset. |
| `remainingPoints` | Points remaining in current duration. |
| `consumedPoints` | Points already consumed. |
| `isFirstInDuration` | Whether this is the first action in current duration. |

### HTTP Response Headers Pattern

```js
const headers = {
  "Retry-After": rateLimiterRes.msBeforeNext / 1000,
  "X-RateLimit-Limit": opts.points,
  "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
  "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)
};
```

## Available Limiters

### Store-based Limiters

| Limiter | Store | Notes |
|---------|-------|-------|
| `RateLimiterRedis` | Redis >=2.6.12 | Works with `ioredis` by default. Requires `+@read +@write +EVAL +EVALSHA` permissions. `RateLimiterRedisNonAtomic` also available (faster, race conditions possible). |
| `RateLimiterMongo` | MongoDB | Supports sharding. |
| `RateLimiterMySQL` | MySQL | Via `mysql2`, `mysql`, Sequelize, or Knex. |
| `RateLimiterPostgres` | PostgreSQL | Via `pg`, Sequelize, TypeORM, or Knex. Custom schema support. |
| `RateLimiterMemcache` | Memcached | |
| `RateLimiterDynamo` | DynamoDB | |
| `RateLimiterPrisma` | via Prisma ORM | |
| `RateLimiterDrizzle` | via Drizzle ORM | Atomic and non-atomic. |
| `RateLimiterSQLite` | SQLite | Via `sqlite3`, `better-sqlite3`, or Knex. |
| `RateLimiterEtcd` | etcd | Atomic and non-atomic. |
| `RateLimiterIoValkey` | Valkey (iovalkey) | |
| `RateLimiterValkeyGlide` | Valkey Glide | |

### In-Process Limiters

| Limiter | Notes |
|---------|-------|
| `RateLimiterMemory` | Single-process only. Fastest. Also works in the browser. Max duration/blockDuration ~24 days (2147483 sec) due to `setTimeout` limitation. |
| `RateLimiterCluster` | Node.js cluster (IPC to master). |
| `RateLimiterClusterMasterPM2` | PM2 cluster mode. |

### Composite / Wrapper Limiters

| Limiter | Description |
|---------|-------------|
| `BurstyRateLimiter` | Combines two limiters: primary + burst allowance. |
| `RateLimiterUnion` | Consume from multiple limiters simultaneously. Only `consume` method. |
| `RateLimiterQueue` | Queue actions and execute at controlled rate (FIFO). |
| `RLWrapperBlackAndWhite` | Wrap any limiter with black/white IP lists. |
| `RLWrapperTimeouts` | Wrap any limiter with custom timeout behavior. |

## Common Patterns

### Express Middleware

```js
const Redis = require('ioredis');
const { RateLimiterRedis } = require('rate-limiter-flexible');

const redisClient = new Redis({ enableOfflineQueue: false });
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'middleware',
  points: 10,
  duration: 1,
});

const rateLimiterMiddleware = (req, res, next) => {
  rateLimiter.consume(req.ip)
    .then(() => next())
    .catch(() => res.status(429).send('Too Many Requests'));
};

app.use(rateLimiterMiddleware);
```

### Koa Middleware

```js
app.use(async (ctx, next) => {
  try {
    await rateLimiter.consume(ctx.ip);
  } catch (rejRes) {
    ctx.status = 429;
    ctx.body = 'Too Many Requests';
    return;
  }
  await next();
});
```

### Hapi Plugin

```js
server.ext('onPreAuth', async (request, h) => {
  try {
    await rateLimiter.consume(request.info.remoteAddress);
    return h.continue;
  } catch (rej) {
    if (rej instanceof Error) {
      return Boom.internal('Try later');
    }
    const error = Boom.tooManyRequests('Rate limit exceeded');
    error.output.headers['Retry-After'] = Math.round(rej.msBeforeNext / 1000) || 1;
    throw error;
  }
});
```

### Login Brute-Force Protection (Minimal)

Two limiters: one for consecutive fails by username, one for fails per IP per day.

```js
const limiterSlowBruteByIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_ip_per_day',
  points: 100,
  duration: 60 * 60 * 24,
  blockDuration: 60 * 60 * 24,
});

const limiterConsecutiveFailsByUsernameAndIP = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_fail_consecutive_username_and_ip',
  points: 10,
  duration: 60 * 60 * 24 * 90,
  blockDuration: 60 * 60,
});
```

Key pattern: `get()` first (cheap read), then `consume()` only on failure.
Reset on successful login: `await limiter.delete(key)`.

### Dynamic Block Duration (Fibonacci escalation)

```js
const loginLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login',
  points: 5,
  duration: 15 * 60,
});

const limiterConsecutiveOutOfLimits = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'login_consecutive_outoflimits',
  points: 99999,
  duration: 0, // never expire — acts as counter
});

// On limit reached: penalty() on counter, then block() with Fibonacci minutes
```

### Authorized vs Unauthorized Users

```js
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 300,
  duration: 60,
});

// Consume 1 point for authenticated, 30 for anonymous
const key = req.userId ? req.userId : req.ip;
const pointsToConsume = req.userId ? 1 : 30;
rateLimiter.consume(key, pointsToConsume);
```

### Websocket Flood Protection

```js
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 1,
});

io.on('connection', (socket) => {
  socket.on('bcast', async (data) => {
    try {
      await rateLimiter.consume(socket.handshake.address);
      socket.emit('news', { data });
      socket.broadcast.emit('news', { data });
    } catch (rejRes) {
      socket.emit('blocked', { 'retry-ms': rejRes.msBeforeNext });
    }
  });
});
```

### BurstyRateLimiter

```js
const burstyLimiter = new BurstyRateLimiter(
  new RateLimiterMemory({ points: 2, duration: 1 }),
  new RateLimiterMemory({ keyPrefix: 'burst', points: 5, duration: 10 })
);
// Allows 2/sec normally + burst of 5 per 10 sec
```

### RateLimiterUnion (multiple simultaneous limits)

```js
const limiter1 = new RateLimiterMemory({ keyPrefix: 'limit1', points: 1, duration: 1 });
const limiter2 = new RateLimiterMemory({ keyPrefix: 'limit2', points: 5, duration: 60 });
const union = new RateLimiterUnion(limiter1, limiter2);
// Rejects if ANY limiter is exhausted
```

### RateLimiterQueue (FIFO execution)

```js
const limiterFlexible = new RateLimiterMemory({ points: 2, duration: 1 });
const limiterQueue = new RateLimiterQueue(limiterFlexible, { maxQueueSize: 100 });
// Queued actions execute at limiter's rate
await limiterQueue.removeTokens(1);
```

### Insurance Strategy (fallback on store failure)

```js
const rateLimiterMemory = new RateLimiterMemory({ points: 1, duration: 1 });
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 5,
  duration: 1,
  insuranceLimiter: rateLimiterMemory,
});
// If Redis fails, RateLimiterMemory is used automatically
```

Note: insurance limiter automatically inherits `blockDuration` and `execEvenly` from parent. Data is NOT copied between limiters when main store recovers.

### In-Memory Block Strategy (DoS mitigation)

```js
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 5,
  duration: 1,
  inMemoryBlockOnConsumed: 5,   // Block in memory after 5 points consumed
  // inMemoryBlockDuration: 10, // Optional: block for fixed duration
});
// ~7x faster: blocked keys served from memory, no store requests
```

Works for `consume()` only. Keys auto-expire without `setTimeout` (no Event Loop overhead).

### Black and White Lists

```js
const limiterWrapped = new RLWrapperBlackAndWhite({
  limiter: rateLimiter,
  whiteList: ['127.0.0.1'],
  blackList: ['13.35.67.49'],
  isWhiteListed: (ip) => /^36.+$/.test(ip),
  isBlackListed: (ip) => /^47.+$/.test(ip),
  runActionAnyway: false,
});
// White-listed: always allowed. Black-listed: always rejected.
// If both: white-listed wins.
```

### Consume with Periodic Sync (reduce store requests)

```js
const rateLimiterMemory = new RateLimiterMemory(opts);
const rateLimiterRedis = new RateLimiterRedis({ storeClient: redisClient, ...opts });

async function consumeWithPeriodicSync(key, syncEveryNRequests = 10) {
  let memoryRes = await rateLimiterMemory.consume(key);
  if (memoryRes.consumedPoints % syncEveryNRequests === 0) {
    const redisRes = await rateLimiterRedis.consume(key, syncEveryNRequests);
    // Sync local state from Redis result
  }
  return memoryRes;
}
```

Sacrifices consistency for performance — useful for high-traffic endpoints.

## Error Handling Best Practices

Always distinguish between store errors and rate limit rejections:

```js
rateLimiter.consume(key)
  .then((rateLimiterRes) => { /* allowed */ })
  .catch((rejRes) => {
    if (rejRes instanceof Error) {
      // Store error (Redis down, etc.)
      // Use insuranceLimiter to avoid this
    } else {
      // Rate limit exceeded — rejRes is RateLimiterRes
      res.set('Retry-After', String(Math.round(rejRes.msBeforeNext / 1000) || 1));
      res.status(429).send('Too Many Requests');
    }
  });
```

## Redis-Specific Setup

```js
// ioredis (default, recommended)
const Redis = require('ioredis');
const redisClient = new Redis({ enableOfflineQueue: false });

const limiter = new RateLimiterRedis({
  storeClient: redisClient,
  points: 5,
  duration: 5,
});

// redis package v4+
const { createClient } = require('redis');
const redisClient = createClient({ /* ... */ });
await redisClient.connect();

const limiter = new RateLimiterRedis({
  storeClient: redisClient,
  useRedisPackage: true,
  points: 5,
  duration: 5,
});
```

`RateLimiterRedis` requires permissions: `+@read +@write +EVAL +EVALSHA`.
`RateLimiterRedisNonAtomic` is a non-atomic alternative — faster but subject to race conditions.

## Key Design Decisions

- **`keyPrefix` is critical** when running multiple limiters — without unique prefixes, keys collide.
- **`duration: 0`** means points never expire — useful for permanent counters.
- **`blockDuration`** extends the block beyond the normal duration window (for malicious activity).
- **`inMemoryBlockOnConsumed`** dramatically reduces store load under DoS (~7x faster per benchmarks).
- **Insurance limiter** keeps your app functional when the store is down, but data is NOT synced back when the store recovers.
- **`execEvenly`** smooths traffic peaks (Leaky Bucket style) but avoid for long durations with few points.
- Use `get()` before `consume()` for login protection — reads are cheaper than upserts, especially under DoS.

## Trust Proxy Warning

When using Express behind a reverse proxy, be careful with `trust proxy`. The `x-forwarded-for` header can be spoofed. Limit it to specific IPs or hop counts. See: https://expressjs.com/en/guide/behind-proxies.html

## Third-Party Framework Integrations

Beyond the built-in Express/Koa/Hapi middleware, community packages exist for:
- **GraphQL:** [graphql-rate-limit-directive](https://www.npmjs.com/package/graphql-rate-limit-directive)
- **NestJS:** [nestjs-rate-limiter](https://www.npmjs.com/package/nestjs-rate-limiter)
- **Fastify-based NestJS:** [nestjs-fastify-rate-limiter](https://www.npmjs.com/package/nestjs-fastify-rate-limiter)

Also supports migration from [express-brute](https://github.com/animir/node-rate-limiter-flexible/wiki/ExpressBrute-migration) and [limiter](https://github.com/animir/node-rate-limiter-flexible/wiki/RateLimiterQueue#migration-from-limiter).

## Creating Custom Limiters

Any new limiter with storage must extend `RateLimiterStoreAbstract` and implement 4 methods:
- `_getRateLimiterRes` — parse raw store data to `RateLimiterRes`.
- `_upsert` — atomic or non-atomic increment. Must support `forceExpire` mode. If non-atomic, suffix class with `NonAtomic` (e.g. `RateLimiterRedisNonAtomic`).
- `_get` — return raw data by key or `null`.
- `_delete` — delete key data, return `true`/`false`.
