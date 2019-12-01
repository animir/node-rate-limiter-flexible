const {
  describe, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterMySQL = require('../lib/RateLimiterMySQL');

describe('RateLimiterMySQL with fixed window', function RateLimiterMySQLTest() {
  this.timeout(5000);
  const mysqlClient = {
    query: () => {},
  };

  let mysqlClientStub;

  beforeEach(() => {
    mysqlClientStub = sinon.stub(mysqlClient, 'query').callsFake((q, cb) => {
      cb();
    });
  });

  afterEach(() => {
    mysqlClientStub.restore();
  });

  it('throw error if can not create db or table', (done) => {
    mysqlClientStub.restore();
    sinon.stub(mysqlClient, 'query').callsFake((q, cb) => {
      cb(Error('test'));
    });

    const rateLimiter = new RateLimiterMySQL({ // eslint-disable-line
      storeClient: mysqlClient, storeType: 'connection', points: 2, duration: 5,
    }, (e) => {
      expect(e instanceof Error).to.equal(true);
      done();
    });
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 2, duration: 5,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        const res = [
          { points: 1, expire: 5000 },
        ];
        if (Array.isArray(data)) {
          cb(null, res);
        } else {
          data(null);
        }
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

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 5,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        const res = [
          { points: 2, expire: 5000 },
        ];
        if (Array.isArray(data)) {
          cb(null, res);
        } else {
          data(null);
        }
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

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1, blockDuration: 2,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        const res = [
          { points: 2, expire: 1000 },
        ];
        if (Array.isArray(data)) {
          cb(null, res);
        } else {
          data(null);
        }
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
    const rateLimiter = new RateLimiterMySQL({ points: 5, storeClient: mysqlClient, storeType: 'connection' });

    const res = rateLimiter._getRateLimiterRes('test', 1, [
      { points: 3, expire: Date.now() + 1000 },
    ]);

    expect(res.msBeforeNext <= 1000
      && res.consumedPoints === 3
      && res.isFirstInDuration === false
      && res.remainingPoints === 2).to.equal(true);
  });

  it('get points', (done) => {
    const testKey = 'get';

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        const res = [
          { points: 1, expire: 1000 },
        ];
        cb(null, res);
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

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        cb(null, []);
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

  it('delete key and return true', (done) => {
    const testKey = 'deletetrue';

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        cb(null, { affectedRows: 1 });
      });

      rateLimiter.delete(testKey)
        .then((res) => {
          expect(res).to.equal(true);
          done();
        });
    });
  });

  it('delete returns false, if there is no key', (done) => {
    const testKey = 'deletefalse';

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        cb(null, { affectedRows: 0 });
      });

      rateLimiter.delete(testKey)
        .then((res) => {
          expect(res).to.equal(false);
          done();
        });
    });
  });

  it('delete rejects on error', (done) => {
    const testKey = 'deleteerr';

    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'connection', points: 1, duration: 1,
    }, () => {
      mysqlClientStub.restore();
      sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        cb(new Error('test'));
      });

      rateLimiter.delete(testKey)
        .catch(() => {
          done();
        });
    });
  });

  it('clearExpired method uses private _getConnection to get connection', (done) => {
    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient, storeType: 'sequelize',
    }, () => {
      const rlStub = sinon.stub(rateLimiter, '_getConnection').callsFake(() => {
        done();
        return Promise.resolve(mysqlClient);
      });

      rateLimiter.clearExpired(1);
      rlStub.restore();
    });
  });

  it('does not expire key if duration set to 0', (done) => {
    const testKey = 'neverexpire';
    const rateLimiter = new RateLimiterMySQL({
      storeClient: mysqlClient,
      storeType: 'connection',
      points: 2,
      duration: 0,
    }, () => {
      mysqlClientStub.restore();
      const queryStub = sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
        const res = [
          { points: 1, expire: null },
        ];
        if (Array.isArray(data)) {
          cb(null, res);
        } else {
          data(null);
        }
      });
      rateLimiter.consume(testKey, 1)
        .then(() => {
          queryStub.restore();
          const queryStub2 = sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
            const res = [
              { points: 2, expire: null },
            ];
            if (Array.isArray(data)) {
              cb(null, res);
            } else {
              data(null);
            }
          });
          rateLimiter.consume(testKey, 1)
            .then(() => {
              queryStub2.restore();
              sinon.stub(mysqlClient, 'query').callsFake((q, data, cb) => {
                const res = [
                  { points: 2, expire: null },
                ];
                if (Array.isArray(data)) {
                  cb(null, res);
                } else {
                  data(null);
                }
              });
              rateLimiter.get(testKey)
                .then((res) => {
                  expect(res.consumedPoints).to.equal(2);
                  expect(res.msBeforeNext).to.equal(-1);
                  done();
                });
            })
            .catch((err) => {
              done(err);
            });
        })
        .catch((err) => {
          done(err);
        });
    });
  });
});
