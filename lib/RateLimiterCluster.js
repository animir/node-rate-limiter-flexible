/**
 * Implements rate limiting in cluster using built-in IPC
 *
 * Two classes are described here: master and worker
 * Master have to be create in the master process without any options.
 * Any number of rate limiters can be created in workers, but each rate limiter must be with unique keyPrefix
 *
 * Workflow:
 * 1. master rate limiter created in master process
 * 2. worker rate limiter sends 'init' message with necessary options during creating
 * 3. master receives options and adds new rate limiter by keyPrefix if it isn't created yet
 * 4. master sends 'init' back to worker's rate limiter
 * 5. worker can process requests immediately,
 *    but they will be postponed by 'workerWaitInit' until master sends 'init' to worker
 * 6. every request to worker rate limiter creates a promise
 * 7. if master doesn't response for 'timeout', promise is rejected
 * 8. master sends 'resolve' or 'reject' command to worker
 * 9. worker resolves or rejects promise depending on message from master
 *
 */

const cluster = require('cluster');
const crypto = require('crypto');
const RateLimiterAbstract = require('./RateLimiterAbstract');
const RateLimiterMemory = require('./RateLimiterMemory');
const RateLimiterRes = require('./RateLimiterRes');

const channel = 'rate_limiter_flexible';
let masterInstance = null;

const masterSendToWorker = function (worker, msg, type, res) {
  let data;
  if (res === null || res === true || res === false) {
    data = res;
  } else {
    data = {
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
      consumedPoints: res.consumedPoints,
      isFirstInDuration: res.isFirstInDuration,
    };
  }
  worker.send({
    channel,
    keyPrefix: msg.keyPrefix, // which rate limiter exactly
    promiseId: msg.promiseId,
    type,
    data,
  });
};

const workerWaitInit = function (payload) {
  setTimeout(() => {
    if (this._initiated) {
      process.send(payload);
      // Promise will be removed by timeout if too long
    } else if (typeof this._promises[payload.promiseId] !== 'undefined') {
      workerWaitInit.call(this, payload);
    }
  }, 30);
};

const workerSendToMaster = function (func, promiseId, key, arg, opts) {
  const payload = {
    channel,
    keyPrefix: this.keyPrefix,
    func,
    promiseId,
    data: {
      key,
      arg,
      opts,
    },
  };

  if (!this._initiated) {
    // Wait init before sending messages to master
    workerWaitInit.call(this, payload);
  } else {
    process.send(payload);
  }
};

const masterProcessMsg = function (worker, msg) {
  if (!msg || msg.channel !== channel || typeof this._rateLimiters[msg.keyPrefix] === 'undefined') {
    return false;
  }

  let promise;

  switch (msg.func) {
    case 'consume':
      promise = this._rateLimiters[msg.keyPrefix].consume(msg.data.key, msg.data.arg, msg.data.opts);
      break;
    case 'penalty':
      promise = this._rateLimiters[msg.keyPrefix].penalty(msg.data.key, msg.data.arg, msg.data.opts);
      break;
    case 'reward':
      promise = this._rateLimiters[msg.keyPrefix].reward(msg.data.key, msg.data.arg, msg.data.opts);
      break;
    case 'block':
      promise = this._rateLimiters[msg.keyPrefix].block(msg.data.key, msg.data.arg, msg.data.opts);
      break;
    case 'get':
      promise = this._rateLimiters[msg.keyPrefix].get(msg.data.key, msg.data.opts);
      break;
    case 'delete':
      promise = this._rateLimiters[msg.keyPrefix].delete(msg.data.key, msg.data.opts);
      break;
    default:
      return false;
  }

  if (promise) {
    promise
      .then((res) => {
        masterSendToWorker(worker, msg, 'resolve', res);
      })
      .catch((rejRes) => {
        masterSendToWorker(worker, msg, 'reject', rejRes);
      });
  }
};

const workerProcessMsg = function (msg) {
  if (!msg || msg.channel !== channel || msg.keyPrefix !== this.keyPrefix) {
    return false;
  }

  if (this._promises[msg.promiseId]) {
    clearTimeout(this._promises[msg.promiseId].timeoutId);
    let res;
    if (msg.data === null || msg.data === true || msg.data === false) {
      res = msg.data;
    } else {
      res = new RateLimiterRes(
        msg.data.remainingPoints,
        msg.data.msBeforeNext,
        msg.data.consumedPoints,
        msg.data.isFirstInDuration // eslint-disable-line comma-dangle
      );
    }

    switch (msg.type) {
      case 'resolve':
        this._promises[msg.promiseId].resolve(res);
        break;
      case 'reject':
        this._promises[msg.promiseId].reject(res);
        break;
      default:
        throw new Error(`RateLimiterCluster: no such message type '${msg.type}'`);
    }

    delete this._promises[msg.promiseId];
  }
};
/**
 * Prepare options to send to master
 * Master will create rate limiter depending on options
 *
 * @returns {{points: *, duration: *, blockDuration: *, execEvenly: *, execEvenlyMinDelayMs: *, keyPrefix: *}}
 */
const getOpts = function () {
  return {
    points: this.points,
    duration: this.duration,
    blockDuration: this.blockDuration,
    execEvenly: this.execEvenly,
    execEvenlyMinDelayMs: this.execEvenlyMinDelayMs,
    keyPrefix: this.keyPrefix,
  };
};

const savePromise = function (resolve, reject) {
  const hrtime = process.hrtime();
  let promiseId = hrtime[0].toString() + hrtime[1].toString();

  if (typeof this._promises[promiseId] !== 'undefined') {
    promiseId += crypto.randomBytes(12).toString('base64');
  }

  this._promises[promiseId] = {
    resolve,
    reject,
    timeoutId: setTimeout(() => {
      delete this._promises[promiseId];
      reject(new Error('RateLimiterCluster timeout: no answer from master in time'));
    }, this.timeoutMs),
  };

  return promiseId;
};

class RateLimiterClusterMaster {
  constructor() {
    if (masterInstance) {
      return masterInstance;
    }

    this._rateLimiters = {};

    cluster.setMaxListeners(0);

    cluster.on('message', (worker, msg) => {
      if (msg && msg.channel === channel && msg.type === 'init') {
        // If init request, check or create rate limiter by key prefix and send 'init' back to worker
        if (typeof this._rateLimiters[msg.opts.keyPrefix] === 'undefined') {
          this._rateLimiters[msg.opts.keyPrefix] = new RateLimiterMemory(msg.opts);
        }

        worker.send({
          channel,
          type: 'init',
          keyPrefix: msg.opts.keyPrefix,
        });
      } else {
        masterProcessMsg.call(this, worker, msg);
      }
    });

    masterInstance = this;
  }
}

class RateLimiterClusterMasterPM2 {
  constructor(pm2) {
    if (masterInstance) {
      return masterInstance;
    }

    this._rateLimiters = {};

    pm2.launchBus((err, pm2Bus) => {
      pm2Bus.on('process:msg', (packet) => {
        const msg = packet.raw;
        if (msg && msg.channel === channel && msg.type === 'init') {
          // If init request, check or create rate limiter by key prefix and send 'init' back to worker
          if (typeof this._rateLimiters[msg.opts.keyPrefix] === 'undefined') {
            this._rateLimiters[msg.opts.keyPrefix] = new RateLimiterMemory(msg.opts);
          }

          pm2.sendDataToProcessId(packet.process.pm_id, {
            data: {},
            topic: channel,
            channel,
            type: 'init',
            keyPrefix: msg.opts.keyPrefix,
          }, (sendErr, res) => {
            if (sendErr) {
              console.log(sendErr, res);
            }
          });
        } else {
          const worker = {
            send: (msgData) => {
              const pm2Message = msgData;
              pm2Message.topic = channel;
              if (typeof pm2Message.data === 'undefined') {
                pm2Message.data = {};
              }
              pm2.sendDataToProcessId(packet.process.pm_id, pm2Message, (sendErr, res) => {
                if (sendErr) {
                  console.log(sendErr, res);
                }
              });
            },
          };
          masterProcessMsg.call(this, worker, msg);
        }
      });
    });

    masterInstance = this;
  }
}

class RateLimiterClusterWorker extends RateLimiterAbstract {
  get timeoutMs() {
    return this._timeoutMs;
  }

  set timeoutMs(value) {
    this._timeoutMs = typeof value === 'undefined' ? 5000 : Math.abs(parseInt(value));
  }

  constructor(opts = {}) {
    super(opts);

    process.setMaxListeners(0);

    this.timeoutMs = opts.timeoutMs;

    this._initiated = false;

    process.on('message', (msg) => {
      if (msg && msg.channel === channel && msg.type === 'init' && msg.keyPrefix === this.keyPrefix) {
        this._initiated = true;
      } else {
        workerProcessMsg.call(this, msg);
      }
    });

    // Create limiter on master with specific options
    process.send({
      channel,
      type: 'init',
      opts: getOpts.call(this),
    });

    this._promises = {};
  }

  consume(key, pointsToConsume = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'consume', promiseId, key, pointsToConsume, options);
    });
  }

  penalty(key, points = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'penalty', promiseId, key, points, options);
    });
  }

  reward(key, points = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'reward', promiseId, key, points, options);
    });
  }

  block(key, secDuration, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'block', promiseId, key, secDuration, options);
    });
  }

  get(key, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'get', promiseId, key, options);
    });
  }

  delete(key, options = {}) {
    return new Promise((resolve, reject) => {
      const promiseId = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'delete', promiseId, key, options);
    });
  }
}

module.exports = {
  RateLimiterClusterMaster,
  RateLimiterClusterMasterPM2,
  RateLimiterCluster: RateLimiterClusterWorker,
};
