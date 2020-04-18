const RateLimiterQueueError = require('./component/RateLimiterQueueError')
const MAX_QUEUE_SIZE = 4294967295;
const KEY_DEFAULT = 'limiter';

module.exports = class RateLimiterQueue {
  constructor(limiterFlexible, opts = {
    maxQueueSize: MAX_QUEUE_SIZE,
  }) {
    this._queueLimiters = {
      KEY_DEFAULT: new RateLimiterQueueInternal(limiterFlexible, opts)
    };
    this._limiterFlexible = limiterFlexible;
    this._maxQueueSize = opts.maxQueueSize
  }

  getTokensRemaining(key = KEY_DEFAULT) {
    if (this._queueLimiters[key]) {
      return this._queueLimiters[key].getTokensRemaining()
    } else {
      return Promise.resolve(this._limiterFlexible.points)
    }
  }

  removeTokens(tokens, key = KEY_DEFAULT) {
    if (!this._queueLimiters[key]) {
      this._queueLimiters[key] = new RateLimiterQueueInternal(
        this._limiterFlexible, {
          key,
          maxQueueSize: this._maxQueueSize,
        })
    }

    return this._queueLimiters[key].removeTokens(tokens)
  }
};

class RateLimiterQueueInternal {

  constructor(limiterFlexible, opts = {
    maxQueueSize: MAX_QUEUE_SIZE,
    key: KEY_DEFAULT,
  }) {
    this._key = opts.key;
    this._waitTimeout = null;
    this._queue = [];
    this._limiterFlexible = limiterFlexible;

    this._maxQueueSize = opts.maxQueueSize
  }

  getTokensRemaining() {
    return this._limiterFlexible.get(this._key)
      .then((rlRes) => {
        return rlRes.remainingPoints
      })
  }

  removeTokens(tokens) {
    const _this = this;

    return new Promise((resolve, reject) => {
      if (tokens > _this._limiterFlexible.points) {
        reject(new RateLimiterQueueError(`Requested tokens ${tokens} exceeds maximum ${_this._limiterFlexible.points} tokens per interval`));
        return
      }

      if (_this._queue.length > 0) {
        _this._queueRequest.call(_this, resolve, reject, tokens);
      } else {
        _this._limiterFlexible.consume(_this._key, tokens)
          .then((res) => {
            resolve(res.remainingPoints);
          })
          .catch((rej) => {
            if (rej instanceof Error) {
              reject(rej);
            } else {
              _this._queueRequest.call(_this, resolve, reject, tokens);
              if (_this._waitTimeout === null) {
                _this._waitTimeout = setTimeout(_this._processFIFO.bind(_this), rej.msBeforeNext);
              }
            }
          });
      }
    })
  }

  _queueRequest(resolve, reject, tokens) {
    const _this = this;
    if (_this._queue.length < _this._maxQueueSize) {
      _this._queue.push({resolve, reject, tokens});
    } else {
      reject(new RateLimiterQueueError(`Number of requests reached it's maximum ${_this._maxQueueSize}`))
    }
  }

  _processFIFO() {
    const _this = this;

    if (_this._waitTimeout !== null) {
      clearTimeout(_this._waitTimeout);
      _this._waitTimeout = null;
    }

    if (_this._queue.length === 0) {
      return;
    }

    const item = _this._queue.shift();
    _this._limiterFlexible.consume(_this._key, item.tokens)
      .then((res) => {
        item.resolve(res.remainingPoints);
        _this._processFIFO.call(_this);
      })
      .catch((rej) => {
        if (rej instanceof Error) {
          item.reject(rej);
          _this._processFIFO.call(_this);
        } else {
          _this._queue.unshift(item);
          if (_this._waitTimeout === null) {
            _this._waitTimeout = setTimeout(_this._processFIFO.bind(_this), rej.msBeforeNext);
          }
        }
      });
  }
}
