const {
  describe,
  it,
  beforeEach,
  afterEach,
} = require('mocha');
const { expect } = require('chai');
const sqlite3 = require('sqlite3');
const { RateLimiterSQLite } = require('../index');

describe('RateLimiterSQLite', () => {
  let db;
  let rateLimiter;

  beforeEach((done) => {
    // Use in-memory SQLite database for testing
    db = new sqlite3.Database(':memory:');
    rateLimiter = new RateLimiterSQLite({
      storeClient: db,
      tableName: 'rate_limiter_test',
      points: 5,
      duration: 5,
    });
    // Wait for table creation
    setTimeout(done, 100);
  });

  afterEach((done) => {
    db.close(() => {
      done();
    });
  });

  describe('basic functionality', () => {
    it('should consume points', async () => {
      const res = await rateLimiter.consume('test');
      expect(res.consumedPoints).to.equal(1);
      expect(res.remainingPoints).to.equal(4);
    });

    it('should reject when too many points consumed', async () => {
      try {
        await rateLimiter.consume('test', 6);
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.remainingPoints).to.equal(0);
        expect(err.consumedPoints).to.equal(6);
      }
    });

    it('should respect points and duration', async () => {
      const res1 = await rateLimiter.consume('test');
      const res2 = await rateLimiter.consume('test');
      expect(res1.consumedPoints).to.equal(1);
      expect(res2.consumedPoints).to.equal(2);
      expect(res2.remainingPoints).to.equal(3);
    });
  });

  describe('block functionality', () => {
    it('should block key for specified duration', async () => {
      await rateLimiter.block('test', 1);

      try {
        await rateLimiter.consume('test');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.msBeforeNext).to.be.at.least(900);
      }
    });
  });

  describe('get and delete operations', () => {
    it('should get points consumed', async () => {
      await rateLimiter.consume('test', 2);
      const res = await rateLimiter.get('test');
      expect(res.consumedPoints).to.equal(2);
    });

    it('should return null when getting non-existent key', async () => {
      const res = await rateLimiter.get('nonexistent');
      expect(res).to.be.null;
    });

    it('should delete key', async () => {
      await rateLimiter.consume('test');
      const deleted = await rateLimiter.delete('test');
      expect(deleted).to.be.true;
      const res = await rateLimiter.get('test');
      expect(res).to.be.null;
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await rateLimiter.delete('nonexistent');
      expect(deleted).to.be.false;
    });
  });

  describe('expiration', () => {
    it('should expire points after duration', (done) => {
      const shortLimiter = new RateLimiterSQLite({
        storeClient: db,
        tableName: 'rate_limiter_test_short',
        points: 5,
        duration: 1, // 1 second duration
      });

      setTimeout(() => {
        shortLimiter.consume('test')
          .then(async () => {
            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100));
            const res = await shortLimiter.get('test');
            expect(res).to.be.null;
            done();
          })
          .catch(done);
      }, 100); // Wait for table creation
    });
  });

  describe('error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Close the database to simulate errors
      await new Promise(resolve => db.close(resolve));

      try {
        await rateLimiter.consume('test');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).to.be.an('error');
      }
    });

    it('should reject operations when table is not created', async () => {
      const invalidLimiter = new RateLimiterSQLite({
        storeClient: db,
        tableName: 'invalid table name with spaces',
        points: 5,
        duration: 5,
      });

      try {
        await invalidLimiter.consume('test');
        expect.fail('should have thrown');
      } catch (err) {
        expect(err.message).to.equal('Table is not created yet');
      }
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple concurrent requests', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(rateLimiter.consume('test'));
      }

      const results = await Promise.all(promises);
      expect(results).to.have.lengthOf(3);
      expect(results[2].consumedPoints).to.equal(3);
      expect(results[2].remainingPoints).to.equal(2);
    });
  });

  describe('cleanup', () => {
    it('should clear expired records', async () => {
      const cleanupLimiter = new RateLimiterSQLite({
        storeClient: db,
        tableName: 'rate_limiter_cleanup',
        points: 5,
        duration: 1,
        clearExpiredByTimeout: true,
      });
      //wait for table creation
      await new Promise(resolve => setTimeout(resolve, 500));


      await cleanupLimiter.consume('test');
      // Wait for expiration and cleanup
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Force cleanup
      await cleanupLimiter.clearExpired(Date.now());

      const res = await cleanupLimiter.get('test');
      console.log(res);
      expect(res).to.be.null;
    });
  });
});
