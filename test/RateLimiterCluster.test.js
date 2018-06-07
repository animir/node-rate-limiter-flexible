const cluster = require('cluster');
const { describe, it, after } = require('mocha');
const { expect } = require('chai');
const { RateLimiterClusterMaster, RateLimiterCluster } = require('../lib/RateLimiterCluster');

if (cluster.isMaster) {
  describe('RateLimiterCluster with fixed window', function () {
    this.timeout(5000);

    after(() => {
      Object.keys(cluster.workers).forEach((id) => {
        cluster.workers[id].send('disconnect');
      });
      cluster.disconnect();
    });

    const rateLimiterClusterMaster = new RateLimiterClusterMaster();

    const worker = cluster.fork();

    it('master must be singleton', () => {
      const rateLimiterClusterMaster2 = new RateLimiterClusterMaster();
      expect(rateLimiterClusterMaster2 === rateLimiterClusterMaster).to.equal(true);
    });

    it('consume 1 point', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'consume 1 point') {
          expect(msg.data._remainingPoints).to.equal(1);
          done();
        }
      });
      worker.send({ channel: 'mocha', test: 'consume 1 point' });
    });

    it('reject on consuming more than maximum points', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'reject on consuming more than maximum points') {
          expect(msg.data._remainingPoints).to.equal(0);
          done();
        }
      });

      worker.send({ channel: 'mocha', test: 'reject on consuming more than maximum points' });
    });

    it('consume evenly over duration', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'consume evenly over duration') {
          expect(msg.data).to.equal(true);
          done();
        }
      });

      worker.send({ channel: 'mocha', test: 'consume evenly over duration' });
    });

    it('use keyPrefix from options', (done) => {
      const keyPrefix = 'test';

      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'use keyPrefix from options') {
          expect(typeof rateLimiterClusterMaster._rateLimiters[keyPrefix]._memoryStorage._storage['test:use keyPrefix from options']
            !== 'undefined').to.equal(true);
          done();
        }
      });

      worker.send({ channel: 'mocha', test: 'use keyPrefix from options', data: keyPrefix });
    });

    it('create 2 rate limiters depending on keyPrefix', (done) => {
      const keyPrefixes = ['create1', 'create2'];
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'create 2 rate limiters depending on keyPrefix') {
          const createdKeyLimiters = Object.keys(rateLimiterClusterMaster._rateLimiters);
          expect(createdKeyLimiters.indexOf(keyPrefixes[0]) !== -1 && createdKeyLimiters.indexOf(keyPrefixes[0]) !== -1).to.equal(true);
          done();
        }
      });

      worker.send({ channel: 'mocha', test: 'create 2 rate limiters depending on keyPrefix', data: keyPrefixes });
    });

    it('penalty', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'penalty') {
          expect(msg.data._remainingPoints).to.equal(1);
          done();
        }
      });
      worker.send({ channel: 'mocha', test: 'penalty' });
    });

    it('reward', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'reward') {
          expect(msg.data._remainingPoints).to.equal(2);
          done();
        }
      });
      worker.send({ channel: 'mocha', test: 'reward' });
    });

    it('block', (done) => {
      worker.on('message', (msg) => {
        if (msg && msg.channel === 'mocha' && msg.test === 'block') {
          expect(msg.data._msBeforeNext > 1000).to.equal(true);
          done();
        }
      });
      worker.send({ channel: 'mocha', test: 'block' });
    });
  });
} else {
  let rateLimiterClusterWorker;
  let rateLimiterClusterWorker1;
  let rateLimiterClusterWorker2;
  const intervalId = setInterval(() => {}, 1000);
  process.on('message', (msg) => {
    if (msg === 'disconnect') {
      clearInterval(intervalId);
    }
  });

  process.on('message', (msg) => {
    if (msg && msg.channel === 'mocha' && typeof msg.test === 'string') {
      switch (msg.test) {
        case 'consume 1 point':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 2, duration: 5, keyPrefix: msg.test });
          rateLimiterClusterWorker.consume(msg.test)
            .then((res) => {
              process.send({ channel: 'mocha', test: msg.test, data: res });
            });
          break;

        case 'reject on consuming more than maximum points':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 2, duration: 5, keyPrefix: msg.test });
          rateLimiterClusterWorker.consume(msg.test, 3)
            .then(() => {

            })
            .catch((rejRes) => {
              process.send({ channel: 'mocha', test: msg.test, data: rejRes });
            });
          break;

        case 'consume evenly over duration':
          rateLimiterClusterWorker = new RateLimiterCluster({
            points: 2, duration: 5, execEvenly: true, keyPrefix: msg.test,
          });
          rateLimiterClusterWorker.consume(msg.test)
            .then(() => {
              const timeFirstConsume = Date.now();
              rateLimiterClusterWorker.consume(msg.test)
                .then(() => {
                  /* Second consume should be delayed more than 2 seconds
                     Explanation:
                     1) consume at 0ms, remaining duration = 4444ms
                     2) delayed consume for (4444 / (0 + 2)) ~= 2222ms, where 2 is a fixed value
                      , because it mustn't delay in the beginning and in the end of duration
                     3) consume after 2222ms by timeout
                  */
                  process.send({ channel: 'mocha', test: msg.test, data: (Date.now() - timeFirstConsume) > 2000 });
                })
                .catch((err) => {
                  process.send({ channel: 'mocha', test: msg.test, data: err });
                });
            })
            .catch((err) => {
              process.send({ channel: 'mocha', test: msg.test, data: err });
            });
          break;

        case 'use keyPrefix from options':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 2, duration: 5, keyPrefix: msg.data });
          rateLimiterClusterWorker.consume(msg.test)
            .then((res) => {
              process.send({ channel: 'mocha', test: msg.test, data: res });
            })
            .catch((rejRes) => {
              process.send({ channel: 'mocha', test: msg.test, data: rejRes });
            });
          break;
        case 'create 2 rate limiters depending on keyPrefix':
          rateLimiterClusterWorker1 = new RateLimiterCluster({ keyPrefix: msg.data[0] });
          rateLimiterClusterWorker2 = new RateLimiterCluster({ keyPrefix: msg.data[1] });
          rateLimiterClusterWorker1.consume(msg.test)
            .then(() => {
              rateLimiterClusterWorker2.consume(msg.test)
                .then(() => {
                  process.send({ channel: 'mocha', test: msg.test, data: {} });
                })
                .catch((rejRes) => {
                  process.send({ channel: 'mocha', test: msg.test, data: rejRes });
                });
            })
            .catch((rejRes) => {
              process.send({ channel: 'mocha', test: msg.test, data: rejRes });
            });
          break;

        case 'penalty':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 2, duration: 5, keyPrefix: msg.test });
          rateLimiterClusterWorker.penalty(msg.test)
            .then((res) => {
              process.send({ channel: 'mocha', test: msg.test, data: res });
            });
          break;

        case 'reward':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 2, duration: 5, keyPrefix: msg.test });
          rateLimiterClusterWorker.consume(msg.test)
            .then(() => {
              rateLimiterClusterWorker.reward(msg.test)
                .then((res) => {
                  process.send({ channel: 'mocha', test: msg.test, data: res });
                });
            })
            .catch((rejRes) => {
              process.send({ channel: 'mocha', test: msg.test, data: rejRes });
            });
          break;
        case 'block':
          rateLimiterClusterWorker = new RateLimiterCluster({ points: 1, duration: 1, keyPrefix: msg.test });
          rateLimiterClusterWorker.block(msg.test, 2)
            .then((res) => {
              process.send({ channel: 'mocha', test: msg.test, data: res });
            })
            .catch((rej) => {
              process.send({ channel: 'mocha', test: msg.test, data: rej });
            });
          break;
        default:
      }
    }
  });
}
