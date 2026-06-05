const RateLimiterQueueError = require('./component/RateLimiterQueueError')
const MAX_QUEUE_SIZE = 4294967295;
const KEY_DEFAULT = 'limiter';

module.exports = class RateLimiterQueue {
  constructor(limiterFlexible, opts = {}) {
    const maxQueueSize =
      opts.maxQueueSize !== undefined ? opts.maxQueueSize : MAX_QUEUE_SIZE;
    this._queueLimiters = {
      KEY_DEFAULT: new RateLimiterQueueInternal(limiterFlexible, {
        ...opts,
        maxQueueSize,
        key: KEY_DEFAULT
      }),
    };
    this._limiterFlexible = limiterFlexible;
    this._maxQueueSize = maxQueueSize;
  }

  getTokensRemaining(key = KEY_DEFAULT) {
    if (this._queueLimiters[key]) {
      return this._queueLimiters[key].getTokensRemaining()
    } else {
      return Promise.resolve(this._limiterFlexible.points)
    }
  }

  removeTokens(tokens, key = KEY_DEFAULT, expiresUnixAt = 0) {
    if (!this._queueLimiters[key]) {
      this._queueLimiters[key] = new RateLimiterQueueInternal(
        this._limiterFlexible, {
          key,
          maxQueueSize: this._maxQueueSize,
        })
    }

    return this._queueLimiters[key].removeTokens(tokens, expiresUnixAt)
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
    // Set to true once a request carrying an expiration deadline
    // (expiresUnixAt > 0) has been queued. While false, _processFIFO skips the
    // expiry sweep entirely, so projects that never pass expiresUnixAt pay no
    // extra cost. It is only ever set, never cleared by the sweep (see
    // _processFIFO for why clearing it would be unsafe).
    this._hasExpiringRequests = false;

    this._maxQueueSize = opts.maxQueueSize
  }

  getTokensRemaining() {
    return this._limiterFlexible.get(this._key)
      .then((rlRes) => {
        return rlRes !== null ? rlRes.remainingPoints : this._limiterFlexible.points;
      })
  }

  removeTokens(tokens, expiresUnixAt = 0) {
    const _this = this;

    return new Promise((resolve, reject) => {
      if (tokens > _this._limiterFlexible.points) {
        reject(new RateLimiterQueueError(`Requested tokens ${tokens} exceeds maximum ${_this._limiterFlexible.points} tokens per interval`));
        return
      }

      if (_this._queue.length > 0) {
        _this._queueRequest.call(_this, resolve, reject, tokens, expiresUnixAt);
      } else {
        _this._limiterFlexible.consume(_this._key, tokens)
          .then((res) => {
            resolve(res.remainingPoints);
          })
          .catch((rej) => {
            if (rej instanceof Error) {
              reject(rej);
            } else {
              _this._queueRequest.call(_this, resolve, reject, tokens, expiresUnixAt);
              if (_this._waitTimeout === null) {
                _this._waitTimeout = setTimeout(_this._processFIFO.bind(_this), rej.msBeforeNext);
              }
            }
          });
      }
    })
  }

  _queueRequest(resolve, reject, tokens, expiresUnixAt = 0) {
    const _this = this;
    if (_this._queue.length < _this._maxQueueSize) {
      _this._queue.push({resolve, reject, tokens, expiresUnixAt});
      if (expiresUnixAt > 0) {
        _this._hasExpiringRequests = true;
      }
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

    // Reject any queued requests that have reached their expiration deadline
    // (expiresUnixAt, in Unix seconds) before they could be fulfilled. The
    // sweep is skipped until a request with a deadline has been queued, so
    // projects that never pass expiresUnixAt keep the original O(1) cost here.
    //
    // The flag is deliberately only ever set, never cleared from a snapshot of
    // _queue: while a request is being consumed it is momentarily shift()ed out
    // of _queue and may be unshift()ed back by the rate-limit retry path below
    // (without going through _queueRequest). Clearing the flag from a snapshot
    // that excludes such an in-flight request could strand it with the sweep
    // permanently disabled, so it would never expire.
    if (_this._hasExpiringRequests) {
      const nowSecs = Math.floor(Date.now() / 1000);
      _this._queue = _this._queue.filter((item) => {
        if (item.expiresUnixAt > 0 && nowSecs >= item.expiresUnixAt) {
          item.reject(new RateLimiterQueueError('The request to remove tokens expired before it could be fulfilled'));
          return false;
        }
        return true;
      });
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
