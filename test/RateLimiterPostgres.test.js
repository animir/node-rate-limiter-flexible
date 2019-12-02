/* eslint-disable no-new */
const {
  describe, it, beforeEach, afterEach,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterPostgres = require('../lib/RateLimiterPostgres');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterPostgres with fixed window', function RateLimiterPostgresTest() {
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

    new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
    }, (e) => {
      expect(e instanceof Error).to.equal(true);
      done();
    });
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
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
      storeClient: pgClient, storeType: 'client', points: 1, duration: 5,
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
      storeClient: pgClient, storeType: 'client', points: 1, duration: 1, blockDuration: 2,
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
    const rateLimiter = new RateLimiterPostgres({ points: 5, storeClient: pgClient, storeType: 'client' });

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
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
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
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
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
      storeClient: pgClient,
      storeType: 'client',
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
      storeClient: pgClient,
      storeType: 'client',
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
          expect(res.msBeforeNext > 2000 && res.msBeforeNext <= 3000).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });

  it('delete key and return true', (done) => {
    const testKey = 'deletetrue';

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rowCount: 1,
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

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').resolves({
        rowCount: 0,
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

    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient, storeType: 'client', points: 2, duration: 5,
    }, () => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').rejects(new Error());

      rateLimiter.delete(testKey)
        .catch(() => {
          done();
        });
    });
  });

  it('query sets unique prefix to prepared statement for every limiter table', (done) => {
    let queryName1;
    let rateLimiter1;
    let rateLimiter2;

    Promise.all([
      new Promise((resolve) => {
        rateLimiter1 = new RateLimiterPostgres({
          storeClient: pgClient, storeType: 'client', tableName: 'upsertqueryname1',
        }, () => {
          resolve();
        });
      }),
      new Promise((resolve) => {
        rateLimiter2 = new RateLimiterPostgres({
          storeClient: pgClient, storeType: 'client', tableName: 'upsertqueryname2',
        }, () => {
          resolve();
        });
      }),
    ]).then(() => {
      pgClientStub.restore();
      pgClientStub = sinon.stub(pgClient, 'query').callsFake((q) => {
        queryName1 = q.name;
        return Promise.resolve({
          rows: [{ points: 1, expire: 5000 }],
        });
      });

      rateLimiter1.consume('test')
        .then(() => {
          pgClientStub.restore();
          pgClientStub = sinon.stub(pgClient, 'query').callsFake((q) => {
            expect(q.name).to.not.equal(queryName1);
            done();
            return Promise.resolve({
              rows: [{ points: 1, expire: 5000 }],
            });
          });

          rateLimiter2.consume('test');
        });
    });
  });

  it('set client type to "client" by constructor name for Client', (done) => {
    class Client {
      Client() {}
      query() {}
    }

    const rateLimiter = new RateLimiterPostgres({
      storeClient: new Client(),
    }, () => {
      expect(rateLimiter.clientType).to.equal('client');
      done();
    });
  });

  it('set client type to "pool" by constructor name for Pool', (done) => {
    class Pool {
      Pool() {}
      query() {}
    }

    const rateLimiter = new RateLimiterPostgres({
      storeClient: new Pool(),
    }, () => {
      expect(rateLimiter.clientType).to.equal('pool');
      done();
    });
  });

  it('set client type to "sequelize" by constructor name for Sequelize', (done) => {
    class Sequelize {
      Sequelize() {}
      query() {}
    }

    const rateLimiter = new RateLimiterPostgres({
      storeClient: new Sequelize(),
    }, () => {
      expect(rateLimiter.clientType).to.equal('sequelize');
      done();
    });
  });

  it('throw error if it is not possible to define client type', (done) => {
    try {
      new RateLimiterPostgres({
        storeClient: {},
      });
    } catch (err) {
      expect(err instanceof Error).to.equal(true);
      done();
    }
  });

  it('private _getConnection returns client for Pool', (done) => {
    class Pool {
      Pool() {}
      query() {}
    }

    const client = new Pool();

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
    }, () => {
      rateLimiter._getConnection()
        .then((conn) => {
          expect(conn).to.equal(client);
          done();
        });
    });
  });

  it('private _getConnection returns connection from manager for Sequelize', (done) => {
    class Sequelize {
      Sequelize() {}
      query() {}
    }

    const client = new Sequelize();
    client.connectionManager = {
      getConnection: () => Promise.resolve(123),
    };

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
    }, () => {
      rateLimiter._getConnection()
        .then((res) => {
          expect(res).to.equal(123);
          done();
        });
    });
  });

  it('private _getConnection returns acquire connection from Knex', (done) => {
    class Knex {
      Knex() {}
      query() {}
    }

    const client = new Knex();
    client.client = {
      acquireConnection: () => Promise.resolve(321),
    };

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
      storeType: 'knex',
    }, () => {
      rateLimiter._getConnection()
        .then((res) => {
          expect(res).to.equal(321);
          done();
        });
    });
  });

  it('Pool does not require specific connection releasing', (done) => {
    class Pool {
      Pool() {}
      query() {}
    }

    const client = new Pool();

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
    }, () => {
      expect(rateLimiter._releaseConnection()).to.equal(true);
      done();
    });
  });

  it('Sequelize release connection from manager', (done) => {
    class Sequelize {
      Sequelize() {}
      query() {}
    }

    const client = new Sequelize();
    client.connectionManager = {
      releaseConnection: () => 123,
    };

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
    }, () => {
      expect(rateLimiter._releaseConnection()).to.equal(123);
      done();
    });
  });

  it('Knex release connection from client', (done) => {
    class Knex {
      Knex() {}
      query() {}
    }

    const client = new Knex();
    client.client = {
      releaseConnection: () => 321,
    };

    const rateLimiter = new RateLimiterPostgres({
      storeClient: client,
      storeType: 'knex',
    }, () => {
      expect(rateLimiter._releaseConnection()).to.equal(321);
      done();
    });
  });

  it('does not expire key if duration set to 0', (done) => {
    const testKey = 'neverexpire';
    const rateLimiter = new RateLimiterPostgres({
      storeClient: pgClient,
      storeType: 'connection',
      points: 2,
      duration: 0,
    }, () => {
      pgClientStub.restore();
      const queryStub = sinon.stub(pgClient, 'query').resolves({
        rows: [{ points: 1, expire: null }],
      });
      rateLimiter.consume(testKey, 1)
        .then(() => {
          queryStub.restore();
          sinon.stub(pgClient, 'query').resolves({
            rows: [{ points: 2, expire: null }],
          });
          rateLimiter.consume(testKey, 1)
            .then(() => {
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
