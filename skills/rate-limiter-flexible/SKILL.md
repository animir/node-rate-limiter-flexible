---
name: rate-limiter-flexible
description: "Use this skill whenever working with rate limiting, brute-force protection, DoS mitigation, or the `rate-limiter-flexible` npm package in Node.js. Triggers include: mentions of 'rate limit', 'rate-limiter-flexible', 'RateLimiter', 'brute force protection', 'login endpoint protection', 'too many requests', '429', throttling in Node.js, or configuring limiters with Redis/Mongo/MySQL/PostgreSQL/Memory/Memcached/DynamoDB/Drizzle/Prisma/SQLite/Cluster/PM2/Etcd/Valkey. Also trigger when writing Express/Koa/Hapi middleware for request limiting, or protecting APIs and websockets from flooding. Use this skill even for tangential questions about rate limiting architecture, choosing a store backend, or scaling rate limiters in distributed systems."
---

# rate-limiter-flexible

Harden application security against brute-force and DoS attacks.
Atomic and non-atomic counters and rate limiting tools for Node.js, Deno, and browsers (Memory limiter). Zero production dependencies. Enhanced fixed window algorithm. ISC license.

- **Install:** `npm i rate-limiter-flexible`
- **ESM:** `import { RateLimiterMemory } from "rate-limiter-flexible"`
- **CommonJS:** `const { RateLimiterMemory } = require("rate-limiter-flexible")`

## When to Use This Skill

- Configuring any `rate-limiter-flexible` limiter (options, API, store setup)
- Writing Express/Koa/Hapi rate limiting middleware
- Implementing login brute-force protection or DoS mitigation
- Choosing between store backends (Redis vs Memory vs Mongo vs etc.)
- Setting up insurance strategy, in-memory block strategy, or BurstyRateLimiter
- Understanding `RateLimiterRes` object and HTTP response headers

## Quick Reference

See `references/full-reference.md` for the complete guide covering:

- All options (common + store-specific) with defaults
- All API methods (`consume`, `get`, `set`, `block`, `delete`, `penalty`, `reward`, `deleteInMemoryBlockedAll`)
- All 15+ limiter types (Redis, Memory, Mongo, MySQL, PostgreSQL, DynamoDB, Memcached, Prisma, Drizzle, SQLite, Etcd, Valkey, Cluster, PM2)
- Composite limiters (BurstyRateLimiter, RateLimiterUnion, RateLimiterQueue)
- Wrappers (Black/White lists, Timeouts, AWS SDK v3)
- Code examples for every common pattern

## Essential Patterns at a Glance

### Basic Usage

```js
const { RateLimiterMemory } = require("rate-limiter-flexible");

const limiter = new RateLimiterMemory({
  points: 10,   // 10 requests
  duration: 1,  // per second
});

limiter.consume(req.ip)
  .then((res) => { /* allowed */ })
  .catch((res) => {
    if (res instanceof Error) { /* store error */ }
    else { /* rate limited — res is RateLimiterRes */ }
  });
```

### HTTP Response Headers

```js
const headers = {
  "Retry-After": rateLimiterRes.msBeforeNext / 1000,
  "X-RateLimit-Limit": opts.points,
  "X-RateLimit-Remaining": rateLimiterRes.remainingPoints,
  "X-RateLimit-Reset": Math.ceil((Date.now() + rateLimiterRes.msBeforeNext) / 1000)
};
```

### Key Defaults

| Option | Default | Notes |
|--------|---------|-------|
| `points` | **Required** | Max consumable over `duration` |
| `duration` | **Required** | Seconds before reset; `0` = never expire |
| `keyPrefix` | `'rlflx'` | Must be unique per limiter |
| `blockDuration` | `0` | Seconds to block after points exhausted |

## Links

- [Full Wiki](https://github.com/animir/node-rate-limiter-flexible/wiki)
- [Options](https://github.com/animir/node-rate-limiter-flexible/wiki/Options)
- [API Methods](https://github.com/animir/node-rate-limiter-flexible/wiki/API-methods)
- [Usage Examples](https://github.com/animir/node-rate-limiter-flexible/wiki/Overall-example)
