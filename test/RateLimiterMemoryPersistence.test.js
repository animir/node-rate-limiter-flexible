/* eslint-disable no-unused-expressions */
const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterMemory Persistence', function RateLimiterMemoryPersistenceTest() {
  this.timeout(5000);

  it('dump results in string with version 1 and all keys', (done) => {
    const rateLimiter = new RateLimiterMemory({ points: 2, duration: 5 });
    rateLimiter.consume('test')
      .then(() => {
        const dump = rateLimiter.dumpToString();
        expect(typeof dump).to.equal('string');
        const data = JSON.parse(dump);
        expect(data.version).to.equal(1);
        expect(data.storage.length).to.equal(1);
        expect(data.storage[0].key).to.equal('test');
        expect(data.storage[0].value).to.equal(1);
        done();
      })
      .catch(done);
  });

  it('restore correctly from string', (done) => {
    const rateLimiter = new RateLimiterMemory({ points: 2, duration: 5 });
    const dump = JSON.stringify({
      version: 1,
      dumpedAt: Date.now(),
      storage: [{ key: 'test', value: 1, expiresAt: Date.now() + 5000 }]
    });

    rateLimiter.restoreFromString(dump);
    rateLimiter.get('test')
      .then((res) => {
        expect(res.consumedPoints).to.equal(1);
        expect(res.remainingPoints).to.equal(1);
        expect(res.msBeforeNext > 0).to.be.true;
        done();
      })
      .catch(done);
  });

  it('full-cycle: dump and then restore in a new instance', (done) => {
    const limiter1 = new RateLimiterMemory({ points: 10, duration: 5 });
    limiter1.consume('user1', 3)
      .then(() => {
        const dump = limiter1.dumpToString();
        const limiter2 = new RateLimiterMemory({ points: 10, duration: 5 });
        limiter2.restoreFromString(dump);

        limiter2.get('user1')
          .then((res) => {
            expect(res.consumedPoints).to.equal(3);
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('restore correctly even if keyPrefix is different', (done) => {
    const limiter1 = new RateLimiterMemory({ points: 10, duration: 5, keyPrefix: 'a' });
    limiter1.consume('user1', 3)
      .then(() => {
        const dump = limiter1.dumpToString();
        const limiter2 = new RateLimiterMemory({ points: 10, duration: 5, keyPrefix: 'b' });
        limiter2.restoreFromString(dump);

        limiter2.get('user1')
          .then((res) => {
            expect(res.consumedPoints).to.equal(3);
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('TTL arithmetic across simulated downtime (shorter than TTL)', (done) => {
    const rateLimiter = new RateLimiterMemory({ points: 10, duration: 10 });
    const now = Date.now();
    const dump = JSON.stringify({
      version: 1,
      dumpedAt: now - 4000, // Simulated 4s downtime
      storage: [{ key: 'test', value: 1, expiresAt: now + 6000 }]
    });

    rateLimiter.restoreFromString(dump);
    rateLimiter.get('test')
      .then((res) => {
        // Should expire in around 6s
        expect(res.msBeforeNext > 5000 && res.msBeforeNext <= 6000).to.be.true;
        done();
      })
      .catch(done);
  });

  it('TTL arithmetic across simulated downtime (longer than TTL)', (done) => {
    const rateLimiter = new RateLimiterMemory({ points: 10, duration: 5 });
    const now = Date.now();
    const dump = JSON.stringify({
      version: 1,
      dumpedAt: now - 6000, // Simulated 6s downtime (TTL was 5s)
      storage: [{ key: 'test', value: 1, expiresAt: now - 1000 }]
    });

    rateLimiter.restoreFromString(dump);
    rateLimiter.get('test')
      .then((res) => {
        expect(res).to.be.null; // Should be ignored
        done();
      })
      .catch(done);
  });

  it('blocked keys survival after restore', (done) => {
    const limiter1 = new RateLimiterMemory({ points: 1, duration: 1, blockDuration: 2 });
    limiter1.consume('attacker', 2)
      .catch(() => {
        const dump = limiter1.dumpToString();
        const limiter2 = new RateLimiterMemory({ points: 1, duration: 1, blockDuration: 2 });
        limiter2.restoreFromString(dump);

        limiter2.consume('attacker')
          .then(() => done(new Error('Should have been blocked')))
          .catch((rej) => {
            try {
              expect(rej.msBeforeNext > 0).to.be.true;
              done();
            } catch (err) {
              done(err);
            }
          });
      })
      .catch(done);
  });

  it('corrupt input does not throw', () => {
    const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });
    expect(() => rateLimiter.restoreFromString('invalid json')).to.not.throw();
    expect(() => rateLimiter.restoreFromString(null)).to.not.throw();
    expect(() => rateLimiter.restoreFromString(undefined)).to.not.throw();
    expect(() => rateLimiter.restoreFromString(JSON.stringify({ version: 1, storage: 'not an array' }))).to.not.throw();
  });

  it('version mismatch does not throw and ignores data', (done) => {
    const rateLimiter = new RateLimiterMemory({ points: 10, duration: 1 });
    const dump = JSON.stringify({
      version: 2, // Future version
      storage: [{ key: 'rlflx:test', value: 1, expiresAt: Date.now() + 5000 }]
    });

    expect(() => rateLimiter.restoreFromString(dump)).to.not.throw();
    rateLimiter.get('test')
      .then((res) => {
        expect(res).to.be.null;
        done();
      })
      .catch(done);
  });

  it('recalculates block state if points configuration changes', (done) => {
    const limiter1 = new RateLimiterMemory({ points: 10, duration: 1 });
    limiter1.consume('user1', 7) // Consumed 7 of 10
      .then(() => {
        const dump = limiter1.dumpToString();
        // New instance only allows 5 points
        const limiter2 = new RateLimiterMemory({ points: 5, duration: 1 });
        limiter2.restoreFromString(dump);

        limiter2.consume('user1')
          .then(() => done(new Error('Should have been blocked as 7 > 5')))
          .catch((rej) => {
            expect(rej.msBeforeNext > 0).to.be.true;
            done();
          });
      })
      .catch(done);
  });
});
