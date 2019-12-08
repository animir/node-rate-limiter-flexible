/* eslint-disable no-new */
const {
  describe, it, beforeEach, before,
} = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RateLimiterMongo = require('../lib/RateLimiterMongo');
const RateLimiterMemory = require('../lib/RateLimiterMemory');

describe('RateLimiterMongo with fixed window', function RateLimiterMongoTest() {
  this.timeout(5000);
  let mongoClient;
  let mongoClientStub;
  let mongoDb;
  let mongoCollection;
  let stubMongoDbCollection;

  before(() => {
    mongoClient = {
      db: () => {},
    };

    mongoDb = {
      collection: () => {},
    };

    stubMongoDbCollection = sinon.stub(mongoDb, 'collection').callsFake(() => mongoCollection);
    mongoClientStub = sinon.stub(mongoClient, 'db').callsFake(() => mongoDb);
  });

  beforeEach(() => {
    mongoCollection = {
      createIndex: () => {},
      findOneAndUpdate: () => {},
      findOne: () => {},
      deleteOne: () => {},
    };
    sinon.stub(mongoCollection, 'createIndex').callsFake(() => {});
  });

  it('consume 1 point', (done) => {
    const testKey = 'consume1';
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 1,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
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
          points: 2,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 1, duration: 5 });
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
          points: 1,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
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
          points: -1,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
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
      storeClient: mongoClient,
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
          points: 11,
          expire: 5000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient,
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
          points: 2,
          expire: 1000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient, points: 1, duration: 1, blockDuration: 2,
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
      storeClient: mongoClient,
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
        expect(res.msBeforeNext > 1000 && res.msBeforeNext <= 2000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('return correct data with _getRateLimiterRes', () => {
    const rateLimiter = new RateLimiterMongo({ points: 5, storeClient: mongoClient });

    const res = rateLimiter._getRateLimiterRes('test', 1, {
      value: {
        points: 3,
        expire: new Date(Date.now() + 1000).toISOString(),
      },
    });

    expect(res.msBeforeNext <= 1000
      && res.consumedPoints === 3
      && res.isFirstInDuration === false
      && res.remainingPoints === 2).to.equal(true);
  });

  it('get points', (done) => {
    const testKey = 'get';

    sinon.stub(mongoCollection, 'findOne').callsFake(() => {
      const res = {
        value: {
          points: 1,
          expire: 1000,
        },
      };
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient, points: 1, duration: 1,
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

  it('get points return NULL if key is not set', (done) => {
    const testKey = 'getnull';

    sinon.stub(mongoCollection, 'findOne').callsFake(() => {
      const res = null;
      return Promise.resolve(res);
    });

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient, points: 1, duration: 1,
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

  it('use dbName from options if db is function', () => {
    mongoClientStub.restore();
    mongoClientStub = sinon.stub(mongoClient, 'db').callsFake((dbName) => {
      expect(dbName).to.equal('test');
      return mongoDb;
    });

    new RateLimiterMongo({
      storeClient: mongoClient, dbName: 'test',
    });

    mongoClientStub.restore();
    mongoClientStub = sinon.stub(mongoClient, 'db').callsFake(() => mongoDb);
  });

  it('use collection from client instead of db if Mongoose in use', () => {
    const createIndex = sinon.spy();
    const mongooseConnection = {
      collection: () => ({
        createIndex,
      }),
    };

    new RateLimiterMongo({
      storeClient: mongooseConnection,
    });
    expect(createIndex.called);
  });

  it('delete key and return true', (done) => {
    const testKey = 'deletetrue';
    sinon.stub(mongoCollection, 'deleteOne').callsFake(() => Promise.resolve({
      result: {
        n: 1,
      },
    }));

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient, points: 1, duration: 1, blockDuration: 2,
    });

    rateLimiter.delete(testKey)
      .then((res) => {
        expect(res).to.equal(true);
        done();
      });
  });

  it('delete returns false, if there is no key', (done) => {
    const testKey = 'deletefalse';
    sinon.stub(mongoCollection, 'deleteOne').callsFake(() => Promise.resolve({
      result: {
        n: 0,
      },
    }));

    const rateLimiter = new RateLimiterMongo({
      storeClient: mongoClient, points: 1, duration: 1, blockDuration: 2,
    });

    rateLimiter.delete(testKey)
      .then((res) => {
        expect(res).to.equal(false);
        done();
      });
  });

  it('uses tableName option to create collection', (done) => {
    const tableName = 'collection_name';

    stubMongoDbCollection.restore();
    stubMongoDbCollection = sinon.stub(mongoDb, 'collection').callsFake((name) => {
      expect(name).to.equal(tableName);
      stubMongoDbCollection.restore();
      stubMongoDbCollection = sinon.stub(mongoDb, 'collection').callsFake(() => mongoCollection);
      done();
      return mongoCollection;
    });

    const client = {
      db: () => mongoDb,
    };

    new RateLimiterMongo({
      storeClient: client,
      tableName,
    });
  });

  it('_upsert adds options.attrs to where clause to find document by additional attributes in conjunction with key', (done) => {
    const testKey = '_upsert';
    const testAttrs = {
      country: 'country1',
    };
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake((where) => {
      expect(where.country).to.equal(testAttrs.country);
      done();
      return Promise.resolve({
        value: {
          points: 1,
          expire: 5000,
        },
      });
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
    rateLimiter.consume(testKey, 1, { attrs: testAttrs })
      .catch((err) => {
        done(err);
      });
  });

  it('forced _upsert adds options.attrs to where clause to find document by additional attributes in conjunction with key', (done) => {
    const testKey = '_upsertforce';
    const testAttrs = {
      country: 'country2',
    };
    sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake((where) => {
      expect(where.country).to.equal(testAttrs.country);
      done();
      return Promise.resolve({
        value: {
          points: 1,
          expire: 5000,
        },
      });
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
    rateLimiter.block(testKey, 1, { attrs: testAttrs })
      .catch((err) => {
        done(err);
      });
  });

  it('_get adds options.attrs to where clause to find document by additional attributes in conjunction with key', (done) => {
    const testKey = '_get';
    const testAttrs = {
      country: 'country3',
    };
    sinon.stub(mongoCollection, 'findOne').callsFake((where) => {
      expect(where.country).to.equal(testAttrs.country);
      done();
      return Promise.resolve({
        value: {
          points: 1,
          expire: 5000,
        },
      });
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
    rateLimiter.get(testKey, { attrs: testAttrs });
  });

  it('_delete adds options.attrs to where clause to find document by additional attributes in conjunction with key', (done) => {
    const testKey = '_delete';
    const testAttrs = {
      country: 'country4',
    };
    sinon.stub(mongoCollection, 'deleteOne').callsFake((where) => {
      expect(where.country).to.equal(testAttrs.country);
      done();
      return Promise.resolve({
        result: {
          n: 0,
        },
      });
    });

    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
    rateLimiter.delete(testKey, { attrs: testAttrs });
  });

  it('set indexKeyPrefix empty {} if not provided', () => {
    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 5 });
    expect(Object.keys(rateLimiter.indexKeyPrefix).length).to.equal(0);
  });

  it('does not expire key if duration set to 0', (done) => {
    const testKey = 'neverexpire';
    const stubFindOneAndUpdate = sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 1,
          expire: null,
        },
      };
      return Promise.resolve(res);
    });
    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 2, duration: 0 });
    rateLimiter.consume(testKey, 1)
      .then(() => {
        stubFindOneAndUpdate.restore();
        const stubFindOneAndUpdate2 = sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
          const res = {
            value: {
              points: 2,
              expire: null,
            },
          };
          return Promise.resolve(res);
        });
        rateLimiter.consume(testKey, 1)
          .then(() => {
            stubFindOneAndUpdate2.restore();
            const stubFindOne = sinon.stub(mongoCollection, 'findOne').callsFake(() => Promise.resolve({
              value: {
                points: 2,
                expire: null,
              },
            }));
            rateLimiter.get(testKey)
              .then((res) => {
                expect(res.consumedPoints).to.equal(2);
                expect(res.msBeforeNext).to.equal(-1);
                stubFindOne.restore();
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

  it('block key forever, if secDuration is 0', (done) => {
    const testKey = 'neverexpire';
    const stubFindOneAndUpdate = sinon.stub(mongoCollection, 'findOneAndUpdate').callsFake(() => {
      const res = {
        value: {
          points: 2,
          expire: null,
        },
      };
      return Promise.resolve(res);
    });
    const rateLimiter = new RateLimiterMongo({ storeClient: mongoClient, points: 1, duration: 1 });
    rateLimiter.block(testKey, 0)
      .then(() => {
        setTimeout(() => {
          stubFindOneAndUpdate.restore();
          const stubFindOne = sinon.stub(mongoCollection, 'findOne').callsFake(() => Promise.resolve({
            value: {
              points: 2,
              expire: null,
            },
          }));
          rateLimiter.get(testKey)
            .then((res) => {
              expect(res.consumedPoints).to.equal(2);
              expect(res.msBeforeNext).to.equal(-1);
              stubFindOne.restore();
              done();
            });
        }, 1000)
      })
      .catch((err) => {
        done(err);
      });
  });
});
