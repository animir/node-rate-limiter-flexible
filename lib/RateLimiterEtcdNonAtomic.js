const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');
const RateLimiterSetupError = require('./component/RateLimiterSetupError');

class RateLimiterEtcdNonAtomic extends RateLimiterStoreAbstract {
  /**
   * @param {Object} opts
   */
  constructor(opts) {
    super(opts);

    if (!opts.storeClient) {
      throw new RateLimiterSetupError('You need to set the option "storeClient" to an instance of class "Etcd3".');
    }

    this.client = opts.storeClient;
  }

  /**
   * Get RateLimiterRes object filled depending on storeResult, which specific for exact store.
   */
  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();

    res.isFirstInDuration = changedPoints === result.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : result.points;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = result.expire ? Math.max(result.expire - Date.now(), 0) : -1;

    return res;
  }

  /**
   * Resolve with object used for {@link _getRateLimiterRes} to generate {@link RateLimiterRes}.
   */
  async _upsert(rlKey, points, msDuration, forceExpire = false) {
    const expire = msDuration > 0 ? Date.now() + msDuration : null;

    let newValue = { points, expire };

    // If we need to force the expiration, just set the key.
    if (forceExpire) {
      await this.client
        .put(rlKey)
        .value(JSON.stringify(newValue));
    } else {
      const oldValue = await this._get(rlKey);
      newValue = { points: (oldValue !== null ? oldValue.points : 0) + points, expire };
      await this.client
        .put(rlKey)
        .value(JSON.stringify(newValue));
    }

    return newValue;
  }

  /**
   * Resolve with raw result from Store OR null if rlKey is not set
   * or Reject with error
   */
  async _get(rlKey) {
    return this.client
      .get(rlKey)
      .string()
      .then(result => (result !== null ? JSON.parse(result) : null));
  }

  /**
   * Resolve with true OR false if rlKey doesn't exist.
   * or Reject with error.
   */
  async _delete(rlKey) {
    return this.client
      .delete()
      .key(rlKey)
      .then(result => result.deleted === '1');
  }
}

module.exports = RateLimiterEtcdNonAtomic;
