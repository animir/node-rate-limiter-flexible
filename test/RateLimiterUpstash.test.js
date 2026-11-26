/* eslint-disable no-unused-expressions */
const {
  describe, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const { Redis } = require('@upstash/redis');
const RateLimiterUpstash = require('../lib/RateLimiterUpstash');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterUpstash with fixed window', function RateLimiterUpstashTest() {
  this.timeout(5500);
  let upstashClient;

  beforeEach(() => {
    // serverless-redis-http in front of local Redis, see docker-compose.yml
    upstashClient = new Redis({
      url: 'http://localhost:8079',
      token: 'example_token',
    });
  });

  afterEach(async () => {
    await upstashClient.flushdb();
  });

  it('consume 1 point', async () => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 2,
      duration: 5,
    });
    const res = await rateLimiter.consume(testKey);
    expect(res.consumedPoints).to.equal(1);
    expect(res.remainingPoints).to.equal(1);
    expect(res.isFirstInDuration).to.be.true;
    expect(res.msBeforeNext).to.be.above(4000).and.at.most(5000);
    expect(await upstashClient.get(rateLimiter.getKey(testKey))).to.equal(1);
  });

  it('rejected when consume more than maximum points', async () => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 5,
    });
    const rejRes = await rateLimiter.consume(testKey, 2).then(() => {
      throw new Error('must not resolve');
    }, res => res);
    expect(rejRes.consumedPoints).to.equal(2);
    expect(rejRes.remainingPoints).to.equal(0);
    expect(rejRes.msBeforeNext).to.be.above(0);
  });

  it('allows exactly points concurrent consumes', async () => {
    const testKey = 'concurrent';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 10,
      duration: 5,
    });
    const results = await Promise.all(Array.from({ length: 30 }, () => rateLimiter
      .consume(testKey)
      .then(() => true, () => false)));
    expect(results.filter(Boolean).length).to.equal(10);
  });

  it('applies customIncrTtlLuaScript', async () => {
    const testKey = 'customscript';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 5,
      customIncrTtlLuaScript: `
        redis.call('set', KEYS[1], 0, 'EX', ARGV[2], 'NX')
        local consumed = redis.call('incrby', KEYS[1], ARGV[1] * 2)
        return {consumed, redis.call('pttl', KEYS[1])}
      `,
    });
    const rejRes = await rateLimiter.consume(testKey).catch(res => res);
    expect(rejRes.consumedPoints).to.equal(2);
  });

  it('makes penalty', async () => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 3,
      duration: 5,
    });
    await rateLimiter.consume(testKey);
    await rateLimiter.penalty(testKey);
    expect(await upstashClient.get(rateLimiter.getKey(testKey))).to.equal(2);
  });

  it('reward points', async () => {
    const testKey = 'reward';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 5,
    });
    await rateLimiter.consume(testKey);
    await rateLimiter.reward(testKey);
    expect(await upstashClient.get(rateLimiter.getKey(testKey))).to.equal(0);
  });

  it('block key in memory when inMemory block options set up', async () => {
    const testKey = 'blockmem';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 10,
    });
    await rateLimiter.consume(testKey);
    const rejRes = await rateLimiter.consume(testKey).catch(res => res);
    expect(rejRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.be.true;
  });

  it('consume using insuranceLimiter when store error', async () => {
    const testKey = 'upstasherror';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: new Redis({ url: 'http://localhost:1', token: 'token', retry: false }),
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterMemory({
        points: 2,
        duration: 2,
      }),
    });
    const res = await rateLimiter.consume(testKey);
    expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.be.true;
  });

  it('rejects with error on store error', async () => {
    const rateLimiter = new RateLimiterUpstash({
      storeClient: new Redis({ url: 'http://localhost:1', token: 'token', retry: false }),
      points: 1,
      duration: 1,
    });
    const err = await rateLimiter.consume('upstasherror2').catch(e => e);
    expect(err instanceof Error).to.be.true;
  });

  it('blocks key for block duration when consumed more than points', async () => {
    const testKey = 'block';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 1,
      blockDuration: 2,
    });
    const rejRes = await rateLimiter.consume(testKey, 2).catch(res => res);
    expect(rejRes.msBeforeNext > 1000).to.be.true;
  });

  it('block custom key', async () => {
    const testKey = 'blockcustom';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 1,
    });
    const blockRes = await rateLimiter.block(testKey, 2);
    expect(blockRes.msBeforeNext).to.equal(2000);
    const rejRes = await rateLimiter.consume(testKey).catch(res => res);
    expect(rejRes.msBeforeNext > 1000).to.be.true;
  });

  it('block key forever, if secDuration is 0', async () => {
    const testKey = 'neverexpire';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 1,
    });
    await rateLimiter.block(testKey, 0);
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(2);
    expect(res.msBeforeNext).to.equal(-1);
  });

  it('get points', async () => {
    const testKey = 'get';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 2,
      duration: 1,
    });
    await rateLimiter.consume(testKey);
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(1);
    expect(res.remainingPoints).to.equal(1);
  });

  it('get returns NULL if key is not set', async () => {
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 2,
      duration: 1,
    });
    expect(await rateLimiter.get('getnull')).to.equal(null);
  });

  it('delete key and return true', async () => {
    const testKey = 'deletetrue';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 2,
      duration: 1,
    });
    await rateLimiter.consume(testKey);
    expect(await rateLimiter.delete(testKey)).to.equal(true);
    expect(await rateLimiter.delete(testKey)).to.equal(false);
  });

  it('does not expire key if duration set to 0', async () => {
    const testKey = 'neverexpire2';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 2,
      duration: 0,
    });
    await rateLimiter.consume(testKey);
    await rateLimiter.consume(testKey);
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(2);
    expect(res.msBeforeNext).to.equal(-1);
  });

  it('set points by key', async () => {
    const testKey = 'set';
    const rateLimiter = new RateLimiterUpstash({
      storeClient: upstashClient,
      points: 1,
      duration: 1,
    });
    await rateLimiter.set(testKey, 12);
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(12);
  });
});
