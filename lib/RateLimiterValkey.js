const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

const incrTtlLuaScript = `
server.call('set', KEYS[1], 0, 'EX', ARGV[2], 'NX')
local consumed = server.call('incrby', KEYS[1], ARGV[1])
local ttl = server.call('pttl', KEYS[1])
return {consumed, ttl}
`;

class RateLimiterValkey extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: ValkeyClient
   *   rejectIfValkeyNotReady: boolean = false - reject / invoke insuranceLimiter immediately when valkey connection is not "ready"
   * }
   */
  constructor(opts) {
    super(opts);
    this.client = opts.storeClient;

    this._rejectIfValkeyNotReady = !!opts.rejectIfValkeyNotReady;
    this._incrTtlLuaScript = opts.customIncrTtlLuaScript || incrTtlLuaScript;

    this.client.defineCommand('rlflxIncr', {
      numberOfKeys: 1,
      lua: this._incrTtlLuaScript,
    });
  }

  /**
   * Prevent actual valkey call if valkey connection is not ready
   * @return {boolean}
   * @private
   */
  _isValkeyReady() {
    if (!this._rejectIfValkeyNotReady) {
      return true;
    }

    return this.client.status === 'ready';
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let consumed;
    let resTtlMs;

    if (Array.isArray(result[0])) {
      [[, consumed], [, resTtlMs]] = result;
    } else {
      [consumed, resTtlMs] = result;
    }

    const res = new RateLimiterRes();
    res.consumedPoints = +consumed;
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = resTtlMs;

    return res;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (!this._isValkeyReady()) {
      throw new Error('Valkey connection is not ready');
    }

    const secDuration = Math.floor(msDuration / 1000);

    if (forceExpire) {
      const multi = this.client.multi();

      if (secDuration > 0) {
        multi.set(rlKey, points, 'EX', secDuration);
      } else {
        multi.set(rlKey, points);
      }

      return multi.pttl(rlKey).exec();
    }

    if (secDuration > 0) {
      return this.client.rlflxIncr([rlKey, String(points), String(secDuration), String(this.points), String(this.duration)]);
    }

    return this.client.multi().incrby(rlKey, points).pttl(rlKey).exec();
  }

  _get(rlKey) {
    if (!this._isValkeyReady()) {
      throw new Error('Valkey connection is not ready');
    }

    return this.client
      .multi()
      .get(rlKey)
      .pttl(rlKey)
      .exec()
      .then((result) => {
        const [[, points]] = result;
        if (points === null) return null;
        return result;
      });
  }

  _delete(rlKey) {
    return this.client
      .del(rlKey)
      .then(result => result > 0);
  }
}

module.exports = RateLimiterValkey;
