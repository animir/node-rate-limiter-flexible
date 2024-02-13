const { describe, it, beforeEach, afterEach } = require('mocha');
const { expect } = require('chai');
const { PrismaClient } = require('@prisma/client');
const sinon = require('sinon');
const RateLimiterPrisma = require('../../../lib/RateLimiterPrisma');
const RateLimiterMemory = require("../../../lib/RateLimiterMemory");

const prisma = new PrismaClient();

after(async () => {
  await prisma.$disconnect();
})

describe('RateLimiterPrisma Postgres with fixed window', function RateLimiterPrismaTest() {
  this.timeout(6000);

  beforeEach(async () => {
    await prisma.rateLimiterFlexible.deleteMany({});
  });

  afterEach(async () => {
    await prisma.rateLimiterFlexible.deleteMany({});
  });

  it('consume 1 point', async () => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      tableName: 'RateLimiterFlexible',
      points: 2,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    const record = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });

    expect(record.points).to.equal(1);
  });

  it('rejected when consume more than maximum points', async () => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 5,
    });

    try {
      await rateLimiter.consume(testKey, 2);
    } catch (rejRes) {
      expect(rejRes.msBeforeNext >= 0).to.equal(true);
    }
  });

  it('execute evenly over duration', async () => {
    const testKey = 'consumeEvenly';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 2,
      duration: 5,
      execEvenly: true,
    });

    await rateLimiter.consume(testKey); // First consume should pass immediately

    const timeFirstConsume = Date.now();
    try {
      await rateLimiter.consume(testKey); // Second consume should be delayed evenly over the duration
      const diff = Date.now() - timeFirstConsume;
      expect(diff).to.be.greaterThan(2400).and.lessThan(5100); // Check if the delay is within the expected range
    } catch (err) {
      expect.fail(`Test failed: ${err.message}`);
    }
  });

  it('execute evenly over duration with minimum delay 20 ms', async () => {
    const testKey = 'consumeEvenlyMinDelay';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 100,
      duration: 1,
      execEvenly: true,
      execEvenlyMinDelayMs: 20,
    });

    await rateLimiter.consume(testKey);
    const timeFirstConsume = Date.now();

    await new Promise(resolve => setTimeout(resolve, 20));
    await rateLimiter.consume(testKey);

    expect(Date.now() - timeFirstConsume >= 20).to.equal(true);
  });

  it('makes penalty', async () => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 3,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    await rateLimiter.penalty(testKey);

    const record = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });

    expect(record.points).to.equal(2);
  });

  it('reward points', async () => {
    const testKey = 'reward';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    await rateLimiter.reward(testKey);

    const record = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });

    expect(record.points).to.equal(0);
  });

  it('block key in memory when inMemory block options set up', async () => {
    const testKey = 'blockmem';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 10,
    });

    await rateLimiter.consume(testKey);
    try {
      await rateLimiter.consume(testKey);
    } catch (rejRes) {
      expect(rejRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.equal(true);
    }
  });

  it('block key in memory for msBeforeNext milliseconds', async () => {
    const testKey = 'blockmempoints';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 1,
    });

    try {
      await rateLimiter.consume(testKey);
      const msBeforeExpire = rateLimiter._inMemoryBlockedKeys.msBeforeExpire(rateLimiter.getKey(testKey));
      expect(msBeforeExpire).to.be.greaterThan(0);
    } catch (err) {
      expect.fail(`Consume failed: ${err.message}`);
    }
  });

  it('reject after block key in memory for msBeforeNext, if consumed more than points', async () => {
    const testKey = 'blockmempointsreject';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 1,
    });

    try {
      await rateLimiter.consume(testKey, 2);
      expect.fail('Expected consume to fail');
    } catch (err) {
      const msBeforeExpire = rateLimiter._inMemoryBlockedKeys.msBeforeExpire(rateLimiter.getKey(testKey));
      expect(msBeforeExpire).to.be.greaterThan(0);
    }
  });

  it('expire inMemory blocked key', async () => {
    const testKey = 'blockmemexpire';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 1,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 2,
    });

    try {
      await rateLimiter.consume(testKey, 2);
    } catch (err) {
      // Expect the key to be blocked at this point
      const blocked = rateLimiter._inMemoryBlockedKeys._keys[rateLimiter.getKey(testKey)]
      expect(!!blocked).to.be.true;

      // Wait for the in-memory block to expire
      await new Promise(resolve => setTimeout(resolve, 2001));

      // Now the block should be expired
      try {
        await rateLimiter.consume(testKey);
        // Consume should succeed, indicating block has expired
      } catch (consumeErr) {
        expect.fail('Expected consume to succeed after block expired');
      }
    }
  });
  it('consume using insuranceLimiter when PrismaClient error', async () => {
    const testKey = 'prismaerror';

    const insuranceLimiter = new RateLimiterMemory({
      points: 2,
      duration: 2,
    });

    const rateLimiter = new RateLimiterPrisma({
      storeClient: { $transaction: () => Promise.reject(new Error('PrismaClient error')) },
      points: 1,
      duration: 1,
      insuranceLimiter: insuranceLimiter,
    });

    try {
      const res = await rateLimiter.consume(testKey);
      expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.equal(true);
    } catch (rej) {
      expect.fail('Expected to fall back to insurance limiter');
    }
  });

  it('blocks key for block duration when consumed more than points', async () => {
    const testKey = 'blockForDuration';
    const blockDuration = 2; // Duration for which the key should be blocked, in seconds

    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 1,
      blockDuration: blockDuration,
    });

    try {
      await rateLimiter.consume(testKey, 2);
      expect.fail('Consume should not be successful, expected to throw an error');
    } catch (rej) {
      expect(rej.msBeforeNext > 1000).to.equal(true)
    }
  });

  it('reject with error, if internal block by blockDuration failed', async () => {
    const testKey = 'blockDurationFail';
    const blockDuration = 2; // Block duration in seconds

    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 1,
      blockDuration: blockDuration,
    });

    // Stubbing the internal block method to simulate a failure
    sinon.stub(rateLimiter, '_block').callsFake(() => Promise.reject(new Error('Block failed')));

    // Attempting to consume more points than allowed to trigger the block
    try {
      await rateLimiter.consume(testKey, 2);
      expect.fail('Expected block to fail and throw an error');
    } catch (err) {
      expect(err.message).to.equal('Block failed');
    }
  });

  it('block expires in blockDuration seconds', async () => {
    const testKey = 'blockExpire';
    const blockDuration = 2; // Block duration in seconds

    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 1,
      blockDuration: blockDuration,
    });

    try {
      await rateLimiter.consume(testKey, 2);
      expect.fail('Expected consume to fail and block the key');
    } catch (rej) {
    }

    await new Promise(resolve => setTimeout(resolve, blockDuration * 1000));

    try {
      await rateLimiter.consume(testKey);
    } catch (err) {
      expect.fail('Expected consume to succeed after block expired');
    }
  });

  it('get points', async () => {
    const testKey = 'getPointsTest';
    const totalPoints = 2; // Total points available

    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: totalPoints,
      duration: 1,
    });

    await rateLimiter.consume(testKey);
    const rateLimiterRecord = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });
    expect(rateLimiterRecord.points).to.equal(totalPoints - 1);

    const limiterStatus = await rateLimiter.get(testKey);
    expect(limiterStatus.remainingPoints).to.equal(totalPoints - 1);
  });

  it('return correct data with _getRateLimiterRes', async () => {
    const rateLimiter = new RateLimiterPrisma({ points: 5, storeClient: prisma });
    const now = new Date();
    const rateLimiterResponse = {
      points: 3,
      expire: new Date(now.getTime() + 1000).toISOString(),
    };

    await prisma.rateLimiterFlexible.create({
      data: {
        key: rateLimiter.getKey('test'),
        points: rateLimiterResponse.points,
        expire: rateLimiterResponse.expire,
      },
    });

    const record = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey('test')}
    });

    const res = rateLimiter._getRateLimiterRes('test', 1, {
      points: rateLimiterResponse.points,
      expire: rateLimiterResponse.expire,
    });

    expect(res.msBeforeNext <= 1000
      && res.consumedPoints === 3
      && res.isFirstInDuration === false
      && res.remainingPoints === 2).to.equal(true);
  });

  it('delete key and return true', async () => {
    const testKey = 'deleteTrueTest';
    const rateLimiter = new RateLimiterPrisma({ storeClient: prisma, points: 2, duration: 1 });

    await prisma.rateLimiterFlexible.create({
      data: { key: rateLimiter.getKey(testKey), points: 1, expire: new Date().toISOString() },
    });

    const deleteResult = await rateLimiter.delete(testKey);
    expect(deleteResult).to.equal(true);
    const record = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });
    expect(record).to.be.null;
  });

  it('block key forever, if secDuration is 0', async () => {
    const testKey = 'blockForeverTest';
    const rateLimiter = new RateLimiterPrisma({
      storeClient: prisma,
      points: 1,
      duration: 1,
    });

    await rateLimiter.block(testKey, 0);
    // Check the key is blocked
    const recordBefore = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });
    expect(recordBefore).not.to.be.null;
    expect(recordBefore.expire).to.equal(null);  // Expecting expire to be null for indefinite block

    // Wait for some time and check if the key is still blocked
    await new Promise(resolve => setTimeout(resolve, 1000));

    const recordAfter = await prisma.rateLimiterFlexible.findUnique({
      where: { key: rateLimiter.getKey(testKey) },
    });
    expect(recordAfter).not.to.be.null;
    expect(recordAfter.expire).to.equal(null);  // Key should still be blocked indefinitely
  });

  // TODO fix test
  it('set points by key forever', async () => {
    const testKey = 'setForeverTest';
    const totalPoints = 12; // Setting the points to this value

    const rateLimiter = new RateLimiterPrisma({ storeClient: prisma, points: 1, duration: 1 });

    const resSet = await rateLimiter.set(testKey, totalPoints, 0);
    const res = await rateLimiter.get(testKey);
    expect(res.remainingPoints).to.equal(0);
    expect(res.consumedPoints).to.equal(totalPoints);
    expect(res.msBeforeNext).to.equal(-1); // or your equivalent for 'forever'
    await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for a time beyond the rate limiter's default duration

    const resAfterWait = await rateLimiter.get(testKey);
    expect(resAfterWait.remainingPoints).to.equal(0);
    expect(resAfterWait.consumedPoints).to.equal(totalPoints);
    expect(resAfterWait.msBeforeNext).to.equal(-1); // or your equivalent for 'forever'
  });

  it('get returns NULL if key is not set', async () => {
    const testKey = 'nonExistentKey';

    const rateLimiter = new RateLimiterPrisma({ storeClient: prisma, points: 1, duration: 1 });

    const res = await rateLimiter.get(testKey);
    expect(res).to.be.null;
  });


});
