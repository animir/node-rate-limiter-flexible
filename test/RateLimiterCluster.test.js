const cluster = require('cluster');
const sinon = require('sinon');
const {describe, it, after} = require('mocha');
const {expect} = require('chai');
const {RateLimiterClusterMaster, RateLimiterCluster} = require('../lib/RateLimiterCluster');
const masterEvents = [];
const workerEvents = [];

const worker = {
  send: (data) => {
    workerEvents.forEach(cb => {
      cb(data);
    })
  }
};

global.process.on = (eventName, cb) => {
  if (eventName === 'message') {
    workerEvents.push(cb);
  }
};
global.process.send = (data) => {
  masterEvents.forEach(cb => {
    cb(worker, data);
  })
};

describe('RateLimiterCluster', function () {
  let rateLimiterClusterMaster;
  let clusterStubOn;
  this.timeout(5000);

  before(() => {
    clusterStubOn = sinon.stub(cluster, 'on').callsFake((eventName, cb) => {
      masterEvents.push(cb);
    });
    rateLimiterClusterMaster = new RateLimiterClusterMaster();
  });

  after(() => {
    clusterStubOn.restore();
  });

  it('master must be singleton', () => {
    const rateLimiterClusterMaster2 = new RateLimiterClusterMaster();
    expect(rateLimiterClusterMaster2 === rateLimiterClusterMaster).to.equal(true);
  });

  it('consume 1 point', (done) => {
    const key = 'consume1';
    const rateLimiterCluster = new RateLimiterCluster({points: 2, duration: 5, keyPrefix: key});
    rateLimiterCluster.consume(key)
      .then((res) => {
        expect(res.remainingPoints).to.equal(1);
        done();
      })
      .catch((rej) => {
        done(rej);
      });
  });

  it('reject on consuming more than maximum points', (done) => {
    const key = 'reject';
    const rateLimiterCluster = new RateLimiterCluster({points: 2, duration: 5, keyPrefix: key});
    rateLimiterCluster.consume(key, 3)
      .then(() => {

      })
      .catch((rejRes) => {
        expect(rejRes.remainingPoints).to.equal(0);
        done();
      });
  });
  //
  it('execute evenly over duration', (done) => {
    const key = 'evenly';
    const rateLimiterCluster = new RateLimiterCluster({
      points: 2, duration: 5, execEvenly: true, keyPrefix: key,
    });
    rateLimiterCluster.consume(key)
      .then(() => {
        const timeFirstConsume = Date.now();
        rateLimiterCluster.consume(key)
          .then(() => {
            /* Second consume should be delayed more than 2 seconds
               Explanation:
               1) consume at 0ms, remaining duration = 4444ms
               2) delayed consume for (4444 / (0 + 2)) ~= 2222ms, where 2 is a fixed value
                , because it mustn't delay in the beginning and in the end of duration
               3) consume after 2222ms by timeout
            */
            expect((Date.now() - timeFirstConsume) > 2000).to.equal(true);
            done();
          })
          .catch((err) => {
            done(err);
          });
      })
      .catch((err) => {
        done(err);
      });
  });

  it('use keyPrefix from options', (done) => {
    const key = 'use keyPrefix from options';

    const keyPrefix = 'test';
    const rateLimiterCluster = new RateLimiterCluster({points: 2, duration: 5, keyPrefix});
    rateLimiterCluster.consume(key)
      .then(() => {
        expect(typeof rateLimiterClusterMaster._rateLimiters[keyPrefix]._memoryStorage._storage[`${keyPrefix}:${key}`]
          !== 'undefined').to.equal(true);
        done();
      })
      .catch((rejRes) => {
        done(rejRes);
      });
  });

  it('create 2 rate limiters depending on keyPrefix', async () => {
    const keyPrefixes = ['create1', 'create2'];
    const rateLimiterClusterprocess1 = new RateLimiterCluster({keyPrefix: keyPrefixes[0]});
    const rateLimiterClusterprocess2 = new RateLimiterCluster({keyPrefix: keyPrefixes[1]});
    await rateLimiterClusterprocess1.consume('key1');
    await rateLimiterClusterprocess2.consume('key2');
    const createdKeyLimiters = Object.keys(rateLimiterClusterMaster._rateLimiters);
    expect(createdKeyLimiters.indexOf(keyPrefixes[0]) !== -1 && createdKeyLimiters.indexOf(keyPrefixes[0]) !== -1).to.equal(true);
  });

  it('penalty', async () => {
    const key = 'penalty';
    const rateLimiterCluster = new RateLimiterCluster({points: 2, duration: 5, keyPrefix: key});
    const res = await rateLimiterCluster.penalty(key);
    expect(res.remainingPoints).to.equal(1);
  });

  it('reward', async () => {
    const key = 'reward';
    const rateLimiterCluster = new RateLimiterCluster({points: 2, duration: 5, keyPrefix: key});
    await rateLimiterCluster.consume(key);
    const res = await rateLimiterCluster.reward(key);
    expect(res.remainingPoints).to.equal(2);
  });

  it('block', async () => {
    const key = 'block';
    const rateLimiterCluster = new RateLimiterCluster({points: 1, duration: 1, keyPrefix: key});
    const res = await rateLimiterCluster.block(key, 2);
    expect(res.msBeforeNext > 1000).to.equal(true);
  });

  it('get', async () => {
    const key = 'get';
    const rateLimiterCluster = new RateLimiterCluster({points: 1, duration: 1, keyPrefix: key});
    await rateLimiterCluster.consume(key);
    const res = await rateLimiterCluster.get(key);
    expect(res.consumedPoints).to.equal(1);
  });

  it('get null', async () => {
    const key = 'getnull';
    const rateLimiterCluster = new RateLimiterCluster({points: 1, duration: 1, keyPrefix: key});
    const res = await rateLimiterCluster.get(key);
    expect(res).to.equal(null);
  });
});

