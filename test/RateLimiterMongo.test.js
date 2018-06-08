const {
  describe, it, beforeEach, before,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterMongo = require('../lib/RateLimiterMongo');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterMongo with fixed window', function () {
  this.timeout(5000);
  let mongoClient;
  let mongoDb;
  let mongoCollection;

  before(() => {
    mongoClient = {
      db: () => {},
    };

    mongoDb = {
      collection: () => {},
    };

    sinon.stub(mongoDb, 'collection').callsFake(() => mongoCollection);
    sinon.stub(mongoClient, 'db').callsFake(() => mongoDb);
  });

  beforeEach(() => {
    mongoCollection = {
      ensureIndex: () => {},
      findOneAndUpdate: () => {},
    };
    sinon.stub(mongoCollection, 'ensureIndex').callsFake(() => {});
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 0,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ mongo: mongoClient, points: 2, duration: 5 });
    rateLimiter.consume(testKey)
      .then((res) => {
        expect(res.consumedPoints).to.equal(1);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('rejected when consume more than maximum points', (done) => {
    const testKey = 'consumerej';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 0,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ mongo: mongoClient, points: 1, duration: 5 });
    rateLimiter.consume(testKey, 2)
      .then(() => {
        done(Error('have to reject'));
      })
      .catch((err) => {
        expect(err.consumedPoints).to.equal(2);
        done();
      });
  });

  it('makes penalty', (done) => {
    const testKey = 'penalty1';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 0,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ mongo: mongoClient, points: 2, duration: 5 });
    rateLimiter.penalty(testKey)
      .then((res) => {
        expect(res.consumedPoints).to.equal(1);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('reward points', (done) => {
    const testKey = 'reward1';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 0,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ mongo: mongoClient, points: 2, duration: 5 });
    rateLimiter.reward(testKey)
      .then((res) => {
        expect(res.consumedPoints).to.equal(-1);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('consume using insuranceLimiter when Mongo error', (done) => {
    const testKey = 'errorinsurance';

    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => Promise.reject(Error('Mongo error')));

    const rateLimiter = new RateLimiterMongo({
      mongo: mongoClient,
      insuranceLimiter: new RateLimiterMemory({
        points: 2,
        duration: 2,
      }),
    });
    rateLimiter.consume(testKey)
      .then((res) => {
        expect(res.remainingPoints).to.equal(1);
        done();
      })
      .catch((err) => {
        done(err);
      });
  });

  it('block key inmemory when inmemory block options set up', (done) => {
    const testKey = 'blockmem';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 10,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      mongo: mongoClient,
      points: 2,
      duration: 5,
      inmemoryBlockOnConsumed: 10,
      inmemoryBlockDuration: 10,
    });
    rateLimiter.consume(testKey)
      .then(() => {
        done(Error('have to reject'));
      })
      .catch(() => {
        expect(rateLimiter._inmemoryBlockedKeys.msBeforeExpire(rateLimiter.getKey(testKey)) > 0).to.equal(true);
        done();
      });
  });

  it('blocks key for block duration when consumed more than points', (done) => {
    const testKey = 'block';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 0,
          expire: 1000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      mongo: mongoClient, points: 1, duration: 1, blockDuration: 2,
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

  it('block using insuranceLimiter when Mongo error', (done) => {
    const testKey = 'mongoerrorblock';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => Promise.reject(Error('Mongo error')));

    const rateLimiter = new RateLimiterMongo({
      mongo: mongoClient,
      points: 1,
      duration: 1,
      blockDuration: 2,
      insuranceLimiter: new RateLimiterMemory({
        points: 1,
        duration: 1,
      }),
    });
    rateLimiter.block(testKey, 2)
      .then((res) => {
        expect(res.msBeforeNext > 1000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('return correct data with _getRateLimiterRes', () => {
    const rateLimiter = new RateLimiterMongo({ points: 5, mongo: mongoClient });

    const res = rateLimiter._getRateLimiterRes('test', 1, {
      value: {
        points: 2,
        expire: new Date(Date.now() + 1000).toISOString()
      }
    });

    expect(
      res.msBeforeNext <= 1000
      && res.consumedPoints === 3
      && res.isFirstInDuration === false
      && res.remainingPoints === 2
    ).to.equal(true);
  });
});
