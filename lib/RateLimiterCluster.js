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
  if (res === null) {
    data = null;
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
    id: msg.id,
    type,
    data,
  });
};

const workerWaitInit = function (payload) {
  setTimeout(() => {
    if (this._initiated) {
      process.send(payload);
      // Promise will be removed by timeout if too long
    } else if (typeof this._promises[payload.id] !== 'undefined') {
      workerWaitInit.call(this, payload);
    }
  }, 30);
};

const workerSendToMaster = function (func, id, key, arg) {
  const payload = {
    channel,
    keyPrefix: this.keyPrefix,
    func,
    id,
    data: {
      key,
      arg,
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
      promise = this._rateLimiters[msg.keyPrefix].consume(msg.data.key, msg.data.arg);
      break;
    case 'penalty':
      promise = this._rateLimiters[msg.keyPrefix].penalty(msg.data.key, msg.data.arg);
      break;
    case 'reward':
      promise = this._rateLimiters[msg.keyPrefix].reward(msg.data.key, msg.data.arg);
      break;
    case 'block':
      promise = this._rateLimiters[msg.keyPrefix].block(msg.data.key, msg.data.arg);
      break;
    case 'get':
      promise = this._rateLimiters[msg.keyPrefix].get(msg.data.key);
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

  if (this._promises[msg.id]) {
    clearTimeout(this._promises[msg.id].timeoutId);
    let res;
    if (msg.data === null) {
      res = null;
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
        this._promises[msg.id].resolve(res);
        break;
      case 'reject':
        this._promises[msg.id].reject(res);
        break;
      default:
        throw new Error(`RateLimiterCluster: no such message type '${msg.type}'`);
    }

    delete this._promises[msg.id];
  }
};
/**
 * Prepare options to send to master
 * Master will create rate limiter depending on options
 *
 * @returns {{points: *, duration: *, execEvenly: *, keyPrefix: *}}
 */
const getOpts = function () {
  return {
    points: this.points,
    duration: this.duration,
    execEvenly: this.execEvenly,
    keyPrefix: this.keyPrefix,
  };
};

const savePromise = function (resolve, reject) {
  const hrtime = process.hrtime();
  let id = hrtime[0].toString() + hrtime[1].toString();

  if (typeof this._promises[id] !== 'undefined') {
    id += crypto.randomBytes(12).toString('base64');
  }

  this._promises[id] = {
    resolve,
    reject,
    timeoutId: setTimeout(() => {
      delete this._promises[id];
      reject(new Error('RateLimiterCluster timeout: no answer from master in time'));
    }, this.timeoutMs),
  };

  return id;
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

    // Create limiter on master with specific options
    process.send({
      channel,
      type: 'init',
      opts: getOpts.call(this),
    });

    process.on('message', (msg) => {
      if (msg && msg.channel === channel && msg.type === 'init' && msg.keyPrefix === this.keyPrefix) {
        this._initiated = true;
      } else {
        workerProcessMsg.call(this, msg);
      }
    });

    this._promises = {};
  }

  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const id = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'consume', id, key, pointsToConsume);
    });
  }

  penalty(key, points = 1) {
    return new Promise((resolve, reject) => {
      const id = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'penalty', id, key, points);
    });
  }

  reward(key, points = 1) {
    return new Promise((resolve, reject) => {
      const id = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'reward', id, key, points);
    });
  }

  block(key, secDuration) {
    return new Promise((resolve, reject) => {
      const id = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'block', id, key, secDuration);
    });
  }

  get(key) {
    return new Promise((resolve, reject) => {
      const id = savePromise.call(this, resolve, reject);

      workerSendToMaster.call(this, 'get', id, key);
    });
  }
}

module.exports = {
  RateLimiterClusterMaster,
  RateLimiterCluster: RateLimiterClusterWorker,
};
