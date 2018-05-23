const cluster = require('cluster');
const crypto = require('crypto');
const RateLimiterAbstract = require('./RateLimiterAbstract');
const RateLimiterMemory = require('./RateLimiterMemory');
const RateLimiterRes = require('./RateLimiterRes');

const channel = 'rate_limiter_flexible';

const masterSendToWorker = function (worker, msg, type, res) {
  worker.send({
    channel,
    keyPrefix: msg.keyPrefix, // which rate limiter exactly
    id: msg.id,
    type,
    data: {
      remainingPoints: res.remainingPoints,
      msBeforeNext: res.msBeforeNext,
    },
  });
};

const workerWaitInit = function (payload) {
  setTimeout(() => {
    if (this._initiated) {
      process.send(payload);
    } else if (typeof this._promises[payload.id] !== 'undefined') {
      workerWaitInit.call(this, payload);
    }
  }, 30);
};

const workerSendToMaster = function (func, id, key, pointsToConsume) {
  const payload = {
    channel,
    keyPrefix: this.keyPrefix,
    func,
    id,
    data: {
      key,
      pointsToConsume,
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

  if (msg.func === 'consume') {
    this._rateLimiters[msg.keyPrefix].consume(msg.data.key, msg.data.pointsToConsume)
      .then((res) => {
        masterSendToWorker(worker, msg, 'resolve', res);
      })
      .catch((rejRes) => {
        masterSendToWorker(worker, msg, 'reject', rejRes);
      });
  } else {
    return false;
  }
};

const workerProcessMsg = function (msg) {
  if (!msg || msg.channel !== channel || msg.keyPrefix !== this.keyPrefix) {
    return false;
  }

  if (this._promises[msg.id]) {
    clearTimeout(this._promises[msg.id].timeoutId);

    switch (msg.type) {
      case 'resolve':
        this._promises[msg.id].resolve(new RateLimiterRes(msg.data.remainingPoints, msg.data.msBeforeNext));
        break;
      case 'reject':
        this._promises[msg.id].reject(new RateLimiterRes(msg.data.remainingPoints, msg.data.msBeforeNext));
        break;
      default:
        throw new Error(`RateLimiterCluster: no such message type '${msg.type}'`);
    }

    delete this._promises[msg.id];
  }
};

const getOpts = function () {
  return {
    points: this.points,
    duration: this.duration,
    execEvenly: this.execEvenly,
    keyPrefix: this.keyPrefix,
  };
};

class RateLimiterClusterMaster {
  constructor() {
    this._rateLimiters = {};

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
  }
}

class RateLimiterClusterWorker extends RateLimiterAbstract {
  get timeoutSec() {
    return this._timeoutSec;
  }

  set timeoutSec(value) {
    this._timeoutSec = typeof value === 'undefined' ? 5 : Math.abs(parseInt(value));
  }

  constructor(opts = {}) {
    super(opts);

    this.timeoutSec = opts.timeoutSec;

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
        }, this.timeoutSec * 1000),
      };

      workerSendToMaster.call(this, 'consume', id, key, pointsToConsume);
    });
  }
}

module.exports = {
  RateLimiterClusterMaster,
  RateLimiterCluster: RateLimiterClusterWorker,
};

