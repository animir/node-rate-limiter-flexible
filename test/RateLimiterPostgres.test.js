const {
  describe, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterPostgres = require('../lib/RateLimiterPostgres');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterPostgres with fixed window', function () {
  this.timeout(5000);
  const pgClient = {
    query: () => {},
  };

  let pgClientStub;

  beforeEach(() => {
    pgClientStub = sinon.stub(pgClient, 'query').callsFake(() => Promise.resolve());
  });

  afterEach(() => {
    pgClientStub.restore();
  });

  it('throw error if can not create table', (done) => {
    pgClientStub.restore();
    pgClientStub = sinon.stub(pgClient, 'query').callsFake(() => Promise.reject(Error('test')));

      const rateLimiter = new RateLimiterPostgres({
        storeClient: pgClient, storeType: 'connection', points: 2, duration: 5
      }, (e) => {
        expect(e instanceof Error).to.equal(true);
        done();
      }); // eslint-disable-line
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection', points: 2, duration: 5
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rows: [{ points: 1, expire: 5000 }],
      });

      rateLimiter.consume(testKey)
        .then((res) => {
          expect(res.consumedPoints).to.equal(1);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  it('rejected when consume more than maximum points', (done) => {
    const testKey = 'consumerej';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection', points: 1, duration: 5
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rows: [{ points: 2, expire: 5000 }],
      });
      rateLimiter.consume(testKey, 2)
        .then(() => {
          done(Error('have to reject'));
        })
        .catch((err) => {
          expect(err.consumedPoints).to.equal(2);
          done();
        });
    });
  });

  it('blocks key for block duration when consumed more than points', (done) => {
    const testKey = 'block';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection', points: 1, duration: 1, blockDuration: 2,
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rows: [{ points: 2, expire: 1000 }],
      });

      rateLimiter.consume(testKey, 2)
        .then(() => {
          done(Error('must not resolve'));
        })
        .catch((rej) => {
          expect(rej.msBeforeNext > 1000).to.equal(true);
          done();
        });
    });
  });

  it('return correct data with _getRateLimiterRes', () => {
    const rateLimiter = new RateLimiterPostgres({ points: 5, storeClient: pgClient, storeType: 'connection' });

    const res = rateLimiter._getRateLimiterRes('test', 1, {
      rows: [{ points: 3, expire: Date.now() + 1000 }],
    });

    expect(res.msBeforeNext <= 1000
      && res.consumedPoints === 3
      && res.isFirstInDuration === false
      && res.remainingPoints === 2).to.equal(true);
  });

  it('get points', (done) => {
    const testKey = 'get';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection', points: 2, duration: 5
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rows: [{ points: 1, expire: 5000 }],
      });

      rateLimiter.get(testKey)
        .then((res) => {
          expect(res.consumedPoints).to.equal(1);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  it('get points return NULL if key is not set', (done) => {
    const testKey = 'getnull';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection', points: 2, duration: 5
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rowCount: 0,
        rows: [],
      });

      rateLimiter.get(testKey)
        .then((res) => {
          expect(res).to.equal(null);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  it('get points using insuranceLimiter on Postgres error', (done) => {
    const testKey = 'geterror';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection',
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterMemory({
        points: 1,
        duration: 1,
      }),
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').callsFake(() => Promise.reject(Error('test')));

      rateLimiter.get(testKey)
        .then((res) => {
          expect(res).to.equal(null);
          done();
        })
        .catch((err) => {
          done(err);
        });
    });
  });

  it('block custom key using insuranceLimiter on Postgres error', (done) => {
    const testKey = 'postgreserrorblock';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'connection',
      points: 1,
      duration: 1,
      insuranceLimiter: new RateLimiterMemory({
        points: 1,
        duration: 1,
      }),
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').callsFake(() => Promise.reject(Error('test')));

      rateLimiter.block(testKey, 3)
        .then((res) => {
          expect(res.msBeforeNext > 2000).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });
});
