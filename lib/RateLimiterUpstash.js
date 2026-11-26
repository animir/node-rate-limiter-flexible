const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

const incrTtlLuaScript = `
redis.call('set', KEYS[1], 0, 'EX', ARGV[2], 'NX')
local consumed = redis.call('incrby', KEYS[1], ARGV[1])
local ttl = redis.call('pttl', KEYS[1])
if ttl == -1 then
  redis.call('expire', KEYS[1], ARGV[2])
  ttl = 1000 * ARGV[2]
end
return {consumed, ttl}
`;

class RateLimiterUpstash extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: Redis client from @upstash/redis
   * }
   */
  constructor(opts) {
    super(opts);
    this.client = opts.storeClient;

    this._incrTtlLuaScript = opts.customIncrTtlLuaScript || incrTtlLuaScript;
    this._incrTtlScript = this.client.createScript(this._incrTtlLuaScript);
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const [consumed, resTtlMs] = result;

    const res = new RateLimiterRes();
    res.consumedPoints = +consumed;
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = resTtlMs;

    return res;
  }

  _getStoredMsDuration(msDuration) {
    return this._getSecDuration(msDuration) * 1000;
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    const secDuration = this._getSecDuration(msDuration);

    if (forceExpire) {
      const multi = this.client.multi();

      if (secDuration > 0) {
        multi.set(rlKey, points, { ex: secDuration });
      } else {
        multi.set(rlKey, points);
      }

      return multi.pttl(rlKey).exec();
    }

    if (secDuration > 0) {
      return this._incrTtlScript.exec(
        [rlKey],
        [String(points), String(secDuration), String(this.points), String(this.duration)],
      );
    }

    return this.client.multi().incrby(rlKey, points).pttl(rlKey).exec();
  }

  _get(rlKey) {
    return this.client
      .multi()
      .get(rlKey)
      .pttl(rlKey)
      .exec()
      .then((result) => {
        const [points] = result;
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

module.exports = RateLimiterUpstash;
