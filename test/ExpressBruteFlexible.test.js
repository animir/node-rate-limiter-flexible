/* eslint-disable no-unused-expressions */
/* eslint-disable prefer-promise-reject-errors */
const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const redisMock = require('redis-mock');
const Memcached = require('memcached-mock');
const ExpressBruteFlexible = require('../lib/ExpressBruteFlexible');
const limiters = require('../index');

const makeRequest = (middleware, req, res, next) => new Promise((resolve) => {
  middleware(req, res, (err) => {
    if (err) {
      resolve(err);
    } else {
      next();
      resolve();
    }
  });
});

describe('ExpressBruteFlexible', function ExpressBruteFlexibleTest() {
  this.timeout(10000);

  const resObj = {
    header: () => {
    },
    status: () => {
    },
    send: () => {
    },
  };

  const memcacheMockClient = new Memcached('localhost:11211');
  const redisMockClient = redisMock.createClient();

  const mongoCollection = {
    createIndex: () => {
    },
    findOneAndUpdate: () => {
    },
    findOne: () => {
    },
    deleteOne: () => {
    },
  };

  const mongoClientMock = {
    db: () => {
    },
  };

  const mongoDb = {
    collection: () => {
    },
  };

  sinon.stub(mongoDb, 'collection').callsFake(() => mongoCollection);
  sinon.stub(mongoClientMock, 'db').callsFake(() => mongoDb);

  const mysqlClientMock = {
    query: () => {
    },
  };

  const pgClientMock = {
    query: () => Promise.resolve(),
  };

  const pgClientErrored = {
    query: () => Promise.reject({ code: 0 }),
  };

  beforeEach((done) => {
    memcacheMockClient.flush(() => {
      redisMockClient.flushall(done);
    });
  });

  it('allows 1 request with 1 free try', (done) => {
    const brute = new ExpressBruteFlexible('memory', {
      freeRetries: 1,
    });

    brute.prevent({ ip: '127.0.0.1' }, resObj, () => {
      done();
    });
  });

  it('allows 2 requests with 2 free try', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MEMCACHE, {
      storeClient: memcacheMockClient,
      freeRetries: 2,
      handleStoreError(err) {
        done(err);
      },
    });

    const next = sinon.spy();
    Promise.all([
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, resObj, next),
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, resObj, next),
    ]).then(() => {
      expect(next.calledTwice).to.equal(true);
      done();
    });
  });

  it('works 0 free try', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MEMCACHE, {
      storeClient: memcacheMockClient,
      freeRetries: 0,
      handleStoreError(err) {
        done(err);
      },
      failCallback(req, res, next) {
        next({ message: 'blocked' });
      },
    });

    const next = sinon.spy();
    Promise.all([
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, resObj, next),
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, resObj, next),
    ]).then(() => {
      expect(next.calledOnce).to.equal(true);
      done();
    });
  });

  it('blocks the second request when no free tries and calls failCallback', () => {
    const brute = new ExpressBruteFlexible('memory', {
      freeRetries: 0,
      minWait: 1000,
      failCallback(req, res, next, nextValidRequestDate) {
        res.status(403);
        res.send({
          error: {
            nextValidRequestDate,
          },
        });
        next();
      },
    });

    const next = sinon.spy();
    const mockRes = Object.assign({}, resObj);
    const resStatusSpy = sinon.spy(mockRes, 'status');
    const resSendSpy = sinon.spy(mockRes, 'send');
    makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next)
      .then(() => {
        makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next)
          .then(() => {
            expect(resStatusSpy.calledWith(403)).to.equal(true);
            const spySendCall = resSendSpy.getCall(0);
            const blockDuration = spySendCall.args[0].error.nextValidRequestDate.getTime() - Date.now();
            expect(blockDuration > 0 && blockDuration <= 1000).to.equal(true);
          });
      });
  });

  it('maxWait limits maximum block duration on high traffic', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 0,
      minWait: 2000,
      maxWait: 3000,
      failCallback(req, res, next, nextValidRequestDate) {
        res.send({
          error: {
            nextValidRequestDate,
          },
        });
        next();
      },
    });

    let maximumBlockDuration = 0;
    const mockRes = Object.assign({}, resObj);
    mockRes.send = (obj) => {
      const blockDuration = obj.error.nextValidRequestDate.getTime() - Date.now();
      if (blockDuration > maximumBlockDuration) {
        maximumBlockDuration = blockDuration;
      }
    };

    const next = sinon.spy();
    const resSendSpy = sinon.spy(mockRes, 'send');
    Promise.all([
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
    ]).then(() => {
      setTimeout(() => {
        Promise.all([
          makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
          makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
        ]).then(() => {
          setTimeout(() => {
            Promise.all([
              makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
              makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
            ]).then(() => {
              setTimeout(() => {
                expect(maximumBlockDuration <= 3000).to.be.true;
                expect(resSendSpy.callCount).to.equal(3);
                done();
              }, 4100);
            });
          }, 3100);
        });
      }, 2100);
    });
  });

  it('block time grows fibonacci-like way', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 0,
      minWait: 2000,
      maxWait: 10000,
      lifetime: 10000,
      failCallback(req, res, next, nextValidRequestDate) {
        res.send({
          error: {
            nextValidRequestDate,
          },
        });
        next();
      },
    });

    let sequenceLength = 0;
    const mockRes = Object.assign({}, resObj);
    mockRes.send = (obj) => {
      const blockDuration = obj.error.nextValidRequestDate.getTime() - Date.now();
      if (blockDuration > 1000 && blockDuration <= 2000 && sequenceLength === 0) {
        sequenceLength++;
      }
      if (blockDuration > 1000 && blockDuration <= 2000 && sequenceLength === 1) {
        sequenceLength++;
      }
      if (blockDuration > 2000 && blockDuration <= 4000 && sequenceLength === 2) {
        sequenceLength++;
      }
    };

    const next = sinon.spy();
    Promise.all([
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
      makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
    ]).then(() => {
      setTimeout(() => {
        Promise.all([
          makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
          makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
        ]).then(() => {
          setTimeout(() => {
            Promise.all([
              makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
              makeRequest(brute.prevent, { ip: '127.0.0.1' }, mockRes, next),
            ]).then(() => {
              setTimeout(() => {
                expect(sequenceLength).to.equal(3);
                done();
              }, 4100);
            });
          }, 2100);
        });
      }, 2100);
    });
  });

  it('attaches reset to request by default and reset works', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 1,
      minWait: 1000,
      maxWait: 5000,
    });

    const req = { ip: '127.0.0.1' };

    brute.prevent(req, resObj, () => {
      expect(typeof req.brute.reset).to.equal('function');
      req.brute.reset(() => {
        brute.prevent(req, resObj, () => {
          done();
        });
      });
    });
  });

  it('does not attach request if option is false', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 1,
      minWait: 1000,
      maxWait: 5000,
      attachResetToRequest: false,
    });

    const req = { ip: '127.0.0.1' };

    brute.prevent(req, resObj, () => {
      expect(typeof req.brute === 'undefined' || typeof req.brute.reset === 'undefined').to.be.true;
      done();
    });
  });

  it('getMiddleware returns middleware function and works', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 1,
      minWait: 1000,
      maxWait: 5000,
      attachResetToRequest: false,
    });

    const middleware = brute.getMiddleware();

    const req = { ip: '127.0.0.1' };

    middleware(req, resObj, done);
  });

  it('ignores IP from key if getMiddleware is with option ignoreIP=false', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
      freeRetries: 1,
      minWait: 1000,
      maxWait: 5000,
      attachResetToRequest: false,
      handleStoreError(err) {
        done(err);
      },
    });

    const getKeySpy = sinon.spy(ExpressBruteFlexible, '_getKey');
    const middleware = brute.getMiddleware({
      ignoreIP: true,
    });

    const req = { ip: '127.0.0.1' };

    middleware(req, resObj, () => {
      const getKeySpyCall = getKeySpy.getCall(0);
      expect(getKeySpyCall.lastArg[0]).to.not.equal(req.ip);
      getKeySpy.restore();
      done();
    });
  });

  it('memory limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MEMORY);
    expect(brute.counterLimiter instanceof limiters.RateLimiterMemory).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterMemory).to.be.true;
  });

  it('memcache limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MEMCACHE, {
      storeClient: memcacheMockClient,
    });
    expect(brute.counterLimiter instanceof limiters.RateLimiterMemcache).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterMemcache).to.be.true;
  });

  it('mongo limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MONGO, {
      storeClient: mongoClientMock,
    });
    expect(brute.counterLimiter instanceof limiters.RateLimiterMongo).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterMongo).to.be.true;
  });

  it('redis limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.REDIS, {
      storeClient: redisMockClient,
    });
    expect(brute.counterLimiter instanceof limiters.RateLimiterRedis).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterRedis).to.be.true;
  });

  it('mysql limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MYSQL, {
      storeClient: mysqlClientMock,
      storeType: 'client',
    });
    expect(brute.counterLimiter instanceof limiters.RateLimiterMySQL).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterMySQL).to.be.true;
  });

  it('postgres limiters created internally by storeType', () => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.POSTGRES, {
      storeClient: pgClientMock,
      storeType: 'client',
    });
    expect(brute.counterLimiter instanceof limiters.RateLimiterPostgres).to.be.true;
    expect(brute.blockLimiter instanceof limiters.RateLimiterPostgres).to.be.true;
  });

  it('global reset works', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.MEMORY, {
      freeRetries: 1,
    });

    const ip = '127.0.0.1';

    brute.prevent({ ip }, resObj, () => {
      brute.reset(ip, undefined, () => {
        const key = ExpressBruteFlexible._getKey([ip, brute.name]);
        brute.freeLimiter.get(key)
          .then((res) => {
            expect(res).to.equal(null);
            done();
          });
      });
    });
  });

  it('global reset launches handleStoreError function', (done) => {
    const brute = new ExpressBruteFlexible(ExpressBruteFlexible.LIMITER_TYPES.POSTGRES, {
      storeClient: pgClientMock,
      storeType: 'client',
      freeRetries: 1,
      handleStoreError() {
        done();
      },
    });

    const ip = '127.0.0.1';
    brute.freeLimiter.client = pgClientErrored;
    brute.reset(ip);
  });
});
