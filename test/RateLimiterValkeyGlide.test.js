/* eslint-disable new-cap */
/* eslint-disable no-unused-expressions */
/* eslint-disable no-new */
/* eslint-disable no-console */
const {
  describe, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterValkeyGlide = require('../lib/RateLimiterValkeyGlide');
const { GlideClient, GlideClusterClient } = require('@valkey/valkey-glide');

describe('RateLimiterValkeyGlide with fixed window', function RateLimiterValkeyGlideTest() {
  this.timeout(5500);
  let glideClient;

  beforeEach(async () => {
    glideClient = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
      clientName: 'testClient',
    });
    await glideClient.flushall();
  });

  afterEach(async () => {
    if (glideClient && !glideClient.isClosed) {
      await glideClient.flushall();
      glideClient.close();
    }
  });

  it('consume 1 point', async () => {
    const testKey = 'consume1';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    const result = await glideClient.get(rateLimiter.getKey(testKey));
    expect(result).to.equal('1');
  });

  it('rejected when consume more than maximum points', async () => {
    const testKey = 'consume2';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 1,
      duration: 5,
    });

    try {
      await rateLimiter.consume(testKey, 2);
      throw new Error('Should have been rejected');
    } catch (rejRes) {
      expect(rejRes.msBeforeNext >= 0).to.equal(true);
    }
  });

  it('execute evenly over duration', async () => {
    const testKey = 'consumeEvenly';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 5,
      execEvenly: true,
    });

    await rateLimiter.consume(testKey);
    const timeFirstConsume = Date.now();

    await rateLimiter.consume(testKey);
    /* Second consume should be delayed more than 2 seconds
       Explanation:
       1) consume at 0ms, remaining duration = 5000ms
       2) delayed consume for (4999 / (0 + 2)) ~= 2500ms, where 2 is a fixed value
        , because it mustn't delay in the beginning and in the end of duration
       3) consume after 2500ms by timeout
    */
    const diff = Date.now() - timeFirstConsume;
    expect(diff > 2400 && diff < 5100).to.equal(true);
  });

  it('makes penalty', async () => {
    const testKey = 'penalty1';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 3,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    await rateLimiter.penalty(testKey);

    const consumedPoints = await glideClient.get(rateLimiter.getKey(testKey));
    expect(consumedPoints).to.equal('2');
  });

  it('reward points', async () => {
    const testKey = 'reward';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 1,
      duration: 5,
    });

    await rateLimiter.consume(testKey);
    await rateLimiter.reward(testKey);

    const consumedPoints = await glideClient.get(rateLimiter.getKey(testKey));
    expect(consumedPoints).to.equal('0');
  });

  it('block key in memory when inMemory block options set up', async () => {
    const testKey = 'blockmem';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 1,
      duration: 5,
      inMemoryBlockOnConsumed: 2,
      inMemoryBlockDuration: 10,
    });

    await rateLimiter.consume(testKey);

    try {
      await rateLimiter.consume(testKey);
      throw new Error('Should have been rejected');
    } catch (rejRes) {
      // msBeforeNext more than 5000, so key was blocked
      expect(rejRes.msBeforeNext > 5000 && rejRes.remainingPoints === 0).to.equal(true);
    }
  });

  it('throws error when connection is not ready with rejectIfValkeyNotReady', async () => {
    const testKey = 'notready';

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 1,
      rejectIfValkeyNotReady: true,
    });

    // Simulate Valkey connection not being ready
    sinon.stub(rateLimiter, '_loadScripts').throws(new Error('Valkey connection is not ready'));
    // Attempt to consume points
    try {
      await rateLimiter.consume(testKey);
      throw new Error('Should have been rejected');
    } catch (error) {
      expect(error.message).to.equal('Valkey connection is not ready');
    }
  });

  it('throw error when function fail to load', async () => {
    const testKey = 'notready2';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 1,
      rejectIfValkeyNotReady: true,
    });
    // Simulate script loading failure
    sinon.stub(rateLimiter.client, 'functionLoad').returns('wrong parameters');
    // Attempt to consume points
    try {
      await rateLimiter.consume(testKey);
      throw new Error('Should have been rejected');
    } catch (error) {
      expect(error.message).to.equal('Valkey connection is not ready, scripts not loaded');
    }
  });

  it('delete key and return true', async () => {
    const testKey = 'delete';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 1,
    });

    await rateLimiter.consume(testKey);
    const result = await rateLimiter.delete(testKey);
    expect(result).to.equal(true);
  });

  it('block custom key', async () => {
    const testKey = 'blockcustom';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 1,
      duration: 1,
    });

    await rateLimiter.block(testKey, 2);
    try {
      await rateLimiter.consume(testKey);
      throw new Error('Should have been rejected');
    } catch (rej) {
      expect(rej.msBeforeNext).to.be.above(999);
      expect(rej.remainingPoints).to.equal(0);
    }
  });

  it('get points', async () => {
    const testKey = 'get';
    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 1,
    });

    await rateLimiter.consume(testKey);
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(1);
  });

  it('uses custom script when provided', async () => {
    const testKey = 'customscript';
    // Custom Lua script that starts counting from 1 instead of 0
    const customScript = `local key = KEYS [1]
      local pointsToAdd = tonumber(ARGV[1]) or 0
      local msDuration = tonumber(ARGV[2]) or 0
      local forceExpire = ARGV[3] == 1
      
      -- Start counting from 1 (instead of 0) when key doesn't exist
      local exists = server.call('exists', key)
      if exists == 0 then
        if msDuration > 0 then
          server.call('set', key, "1", 'PX', msDuration)
        else
          server.call('set', key, "1")
        end
        return {1, msDuration}
      end
      
      local newPoints = 0
      if forceExpire and msDuration > 0 then
        -- Force expire with duration - set with new expiry
        server.call('set', key, pointsToAdd, 'PX', msDuration)
        newPoints = pointsToAdd
      else
        -- Regular increment
        newPoints = server.call('incrby', key, pointsToAdd)
      end
      
      local ttl = server.call('pttl', key)
      return {newPoints, ttl}`;

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClient,
      points: 2,
      duration: 5,
      customFunction: customScript,
    });

    await rateLimiter.consume(testKey);
    const result = await glideClient.get(rateLimiter.getKey(testKey));
    // Should be 1 because initial value is 1 in the custom script
    expect(result).to.equal('1');
  });

  it('throws error on GlideClient error', async () => {
    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });
    const testKey = 'glideerror';

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
    });

    // Close the client to simulate connection error
    glideClientClosed.close();

    try {
      await rateLimiter.consume(testKey);
      throw new Error('Should have been rejected');
    } catch (rejRes) {
      expect(rejRes instanceof Error).to.equal(true);
    }
  });

  it('consume using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerror2';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      clientName: 'insuranceLimiter',
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 2,
        storeClient: glideClient,
      }),
    });

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    // Consume from insurance limiter with different options
    const res = await rateLimiter.consume(testKey);
    expect(res.remainingPoints === 1 && res.msBeforeNext > 1000).to.equal(true);
    // Check that the client closed is closed
    expect(glideClientClosed.isClosed).to.equal(true);
  });

  it('penalty using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerror3';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 2,
        storeClient: glideClient,
      }),
    });

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    await rateLimiter.penalty(testKey);
    const consumedPoints = await glideClient.get(rateLimiter.getKey(testKey));
    expect(consumedPoints).to.equal('1');
  });

  it('reward using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerror4';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 2,
        storeClient: glideClient,
      }),
    });

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    // Consume (will use insurance limiter)
    try {
      await rateLimiter.consume(testKey, 2);
    } catch (error) {
      // Expected to reject because consuming more than points
    }

    // Reward (will use insurance limiter)
    await rateLimiter.reward(testKey);

    const consumedPoints = await glideClient.get(rateLimiter.getKey(testKey));
    expect(consumedPoints).to.equal('1');
  });

  it('block using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerrorblock';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 1,
        duration: 1,
        storeClient: glideClient,
      }),
    });

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    const res = await rateLimiter.block(testKey, 3);
    expect(res.msBeforeNext > 2000 && res.msBeforeNext <= 3000).to.equal(true);
  });

  it('get using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerrorget';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 2,
        storeClient: glideClient,
      }),
    });

    // Set up some data using insurance limiter
    await glideClient.set(rateLimiter.getKey(testKey), '1');

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    // Get using insurance limiter
    const res = await rateLimiter.get(testKey);
    expect(res.consumedPoints).to.equal(1);
  });

  it('delete using insuranceLimiter when GlideClient error', async () => {
    const testKey = 'glideerrordelete';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 2,
        storeClient: glideClient,
      }),
    });

    // Set up some data in both clients
    await glideClient.set(rateLimiter.getKey(testKey), '1');

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    // Delete using insurance limiter
    const result = await rateLimiter.delete(testKey);
    expect(result).to.equal(true);
  });

  it('insurance limiter on error consume applies options.customDuration to set expire', async () => {
    const testKey = 'consume.customDuration.onerror';

    // Create a separate client that we'll close to simulate failure
    const glideClientClosed = await GlideClient.createClient({
      addresses: [{ host: '127.0.0.1', port: 8080 }],
      useTls: false,
      requestTimeout: 1000,
    });

    const rateLimiter = new RateLimiterValkeyGlide({
      storeClient: glideClientClosed,
      points: 1,
      duration: 2,
      insuranceLimiter: new RateLimiterValkeyGlide({
        points: 2,
        duration: 3,
        storeClient: glideClient,
      }),
    });

    // Close the main client to force using insurance limiter
    glideClientClosed.close();

    // Consume from insurance limiter with different options
    const res = await rateLimiter.consume(testKey, 1, { customDuration: 1 });
    expect(res.remainingPoints === 1 && res.msBeforeNext <= 1000).to.equal(true);
  });
});

(GlideClusterClient ? describe : describe.skip)(
  'RateLimiterValkeyGlide with cluster client',
  function RateLimiterValkeyGlideClusterTest() {
    this.timeout(10000);
    let glideClusterClient;

    beforeEach(async () => {
      console.log(process.env.VALKEY_CLUSTER_PORT);
      glideClusterClient = await GlideClusterClient.createClient({
        addresses: [{ host: '127.0.0.1', port: Number(process.env.VALKEY_CLUSTER_PORT) || 8081 }],
        useTLS: false,
        requestTimeout: 1000,
      });
      await glideClusterClient.flushall();
    });

    afterEach(async () => {
      if (glideClusterClient) {
        try {
          await glideClusterClient.flushall();
        } catch (e) {
          console.log('Could not flush cluster DB during cleanup', e);
        }
        glideClusterClient.close();
      }
    });

    it('consume 1 point with cluster client', async () => {
      const testKey = 'cluster:consume1';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 5,
      });

      await rateLimiter.consume(testKey);
      const result = await glideClusterClient.get(rateLimiter.getKey(testKey));
      expect(result).to.equal('1');
    });

    it('uses custom script with cluster client', async () => {
      const testKey = 'cluster:customscript';
      // Custom Lua script that starts counting from 1 instead of 0
      const customScript = `local key = KEYS[1]
local pointsToConsume = ARGV[1]
local pointsToConsumeInt = tonumber(pointsToConsume)
local msDuration = ARGV[2]
local forceExpire = ARGV[3] == 1
local sec_duration = math.floor(msDuration / 1000)
-- Start counting from 1 (instead of 0) when key doesn't exist
local exists = server.call('exists', key)
if exists == 0 and pointsToConsumeInt > 0 then
  if sec_duration > 0 then
    server.call('set', key, 1, 'EX', sec_duration)
  else
    server.call('set', key, 1)
  end
  local pttl = server.call('pttl', key)
  return {1, pttl}
end
-- Handle force expire case
if forceExpire then
  if sec_duration > 0 then
    server.call('set', key, pointsToConsume, 'EX', sec_duration)
  else
    server.call('set', key, pointsToConsume)
  end
  local pttl = server.call('pttl', key)
  return {pointsToConsumeInt, pttl}
end
-- Handle duration case
if sec_duration > 0 then
  server.call('set', key, "0", 'EX', sec_duration, 'NX')
end
-- Handle increment and return result
local consumed = server.call('incrby', key, pointsToConsumeInt)
local pttl = server.call('pttl', key)
return {consumed, pttl}`;

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 5,
        customFunction: customScript,
      });

      await rateLimiter.consume(testKey);
      const result = await glideClusterClient.get(rateLimiter.getKey(testKey));
      // Should be 1 because initial value is 1 in the custom script
      expect(result).to.equal('1');
    });

    it('makes penalty with cluster client', async () => {
      const testKey = 'cluster:penalty';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 3,
        duration: 5,
      });

      await rateLimiter.consume(testKey);
      await rateLimiter.penalty(testKey);
      const result = await glideClusterClient.get(rateLimiter.getKey(testKey));
      expect(result).to.equal('2');
    });

    it('reward points with cluster client', async () => {
      const testKey = 'cluster:reward';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 1,
        duration: 5,
      });

      await rateLimiter.consume(testKey);
      await rateLimiter.reward(testKey);
      const result = await glideClusterClient.get(rateLimiter.getKey(testKey));
      expect(result).to.equal('0');
    });

    it('blocks key for block duration when consumed more than points', async () => {
      const testKey = 'cluster:block';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 1,
        duration: 1,
        blockDuration: 2,
      });

      try {
        await rateLimiter.consume(testKey, 2);
        expect.fail('must not resolve');
      } catch (rej) {
        expect(rej.msBeforeNext > 1000).to.equal(true);
      }
    });

    it('consume applies options.customDuration to set expire', async () => {
      const testKey = 'cluster:customDuration';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 5,
      });

      const res = await rateLimiter.consume(testKey, 1, { customDuration: 1 });
      expect(res.msBeforeNext <= 1000).to.be.true;
    });

    it('does not expire key if duration set to 0', async () => {
      const testKey = 'cluster:neverexpire';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 0,
      });

      await rateLimiter.consume(testKey, 1);
      await rateLimiter.consume(testKey, 1);
      const res = await rateLimiter.get(testKey);
      expect(res.consumedPoints).to.equal(2);
      expect(res.msBeforeNext).to.equal(-1);
    });

    it('set points by key', async () => {
      const testKey = 'cluster:set';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 12,
        duration: 1,
      });

      const secDuration = 1;
      await rateLimiter.set(testKey, 10, secDuration);
      const res = await rateLimiter.get(testKey);
      expect(res.consumedPoints).to.equal(10);
    });

    it('set points by key forever', async () => {
      const testKey = 'cluster:setforever';

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 12,
        duration: 1,
      });

      await rateLimiter.set(testKey, 1, 0);
      // Wait to ensure it doesn't expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      const res = await rateLimiter.get(testKey);

      expect(res.consumedPoints).to.equal(1);
      expect(res.msBeforeNext).to.equal(-1);
    });

    it('throws error when inMemoryBlockOnConsumed is not set but inMemoryBlockDuration is', async () => {
      try {
        new RateLimiterValkeyGlide({
          storeClient: glideClusterClient,
          inMemoryBlockDuration: 2,
        });

        expect.fail('should have thrown error');
      } catch (err) {
        expect(err instanceof Error).to.equal(true);
      }
    });

    it('throws error when inMemoryBlockOnConsumed is less than points', async () => {
      try {
        new RateLimiterValkeyGlide({
          storeClient: glideClusterClient,
          points: 2,
          inMemoryBlockOnConsumed: 1,
        });

        expect.fail('should have thrown error');
      } catch (err) {
        expect(err instanceof Error).to.equal(true);
      }
    });

    it('expire inMemory blocked key', async () => {
      const testKey = 'cluster:blockmem2';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 1,
        duration: 1,
        inMemoryBlockOnConsumed: 2,
        inMemoryBlockDuration: 2,
      });

      // It blocks on the first consume as consumed points more than available
      try {
        await rateLimiter.consume(testKey, 2);
        expect.fail('should have been rejected');
      } catch (rejRes) {
        // Wait for block to expire
        await new Promise(resolve => setTimeout(resolve, 2001));
        const res = await rateLimiter.consume(testKey);

        // Block expired
        expect(res.msBeforeNext <= 1000 && res.remainingPoints === 0).to.equal(true);
      }
    });

    it('block key forever if secDuration is 0', async () => {
      const testKey = 'cluster:blockforever';

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 1,
        duration: 1,
      });

      await rateLimiter.block(testKey, 0); // Block forever
      // Wait to verify it doesn't expire
      await new Promise(resolve => setTimeout(resolve, 2000));
      const res = await rateLimiter.get(testKey);

      expect(res.consumedPoints).to.equal(2);
      expect(res.msBeforeNext).to.equal(-1);
    });

    it('get returns NULL if key is not set', async () => {
      const testKey = 'cluster:nonexistent';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 1,
      });

      const res = await rateLimiter.get(testKey);

      expect(res).to.equal(null);
    });

    it('delete returns false if key does not exist', async () => {
      const testKey = 'cluster:nonexistent';

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 1,
      });

      const result = await rateLimiter.delete(testKey);

      expect(result).to.equal(false);
    });

    it('execute evenly over duration with cluster client', async () => {
      const testKey = 'cluster:consumeEvenly';
      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 5,
        execEvenly: true,
      });

      await rateLimiter.consume(testKey);
      const timeFirstConsume = Date.now();
      await rateLimiter.consume(testKey);
      const diff = Date.now() - timeFirstConsume;

      /* Second consume should be delayed ~2.5 seconds
         (4999 / (0 + 2)) ~= 2500ms where 2 is fixed value */
      expect(diff > 2400 && diff < 5100).to.equal(true);
    });

    it('execute evenly with minimum delay', async () => {
      const testKey = 'cluster:consumeEvenlyMinDelay';

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 100,
        duration: 1,
        execEvenly: true,
        execEvenlyMinDelayMs: 20,
      });

      await rateLimiter.consume(testKey);
      const timeFirstConsume = Date.now();
      await rateLimiter.consume(testKey);

      expect(Date.now() - timeFirstConsume >= 20).to.equal(true);
    });

    it('reject but preserve points on parallel requests', async () => {
      const testKey = 'cluster:parallel';

      const rateLimiter = new RateLimiterValkeyGlide({
        storeClient: glideClusterClient,
        points: 2,
        duration: 1,
      });

      await rateLimiter.delete(testKey);

      const results = await Promise.allSettled([
        rateLimiter.consume(testKey),
        rateLimiter.consume(testKey),
        rateLimiter.consume(testKey),
      ]);
      // Check that the first two requests were fulfilled and the third was rejected
      const consumed = results.filter(r => r.status === 'fulfilled').length;
      expect(consumed).to.equal(2);
      expect(results.filter(r => r.status === 'rejected').length).to.equal(1);
    });
  },
);
