const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');
const RateLimiterQueueError = require('./component/RateLimiterQueueError');

const MAX_TRANSACTION_TRIES = 5;

class RateLimiterEtcd extends RateLimiterStoreAbstract {
  /**
   * @param {Object} opts
   */
  constructor(opts) {
    super(opts);

    if (!opts.storeClient) {
      throw new RateLimiterQueueError('You need to set the option "storeClient" to an instance of class "Etcd3".');
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
    let oldValue;

    // If we need to force the expiration, just set the key.
    if (forceExpire) {
      return this.client
        .put(rlKey)
        .value(JSON.stringify(newValue))
        .then(newValue);
    }

    // Try to add a new key (returns false if the key was already there)
    const added = await this.client
      .if(rlKey, 'Version', '===', '0')
      .then(this.client
        .put(rlKey)
        .value(JSON.stringify(newValue)))
      .commit()
      .then(result => !!result.succeeded);

    // If the key already exists, try to update it in a transaction
    if (!added) {
      let success = false;

      for (let i = 0; i < MAX_TRANSACTION_TRIES; i++) {
        // eslint-disable-next-line no-await-in-loop
        oldValue = await this._get(rlKey);
        newValue = { points: oldValue.points + points, expire };

        // eslint-disable-next-line no-await-in-loop
        success = await this.client
          .if(rlKey, 'Value', '===', JSON.stringify(oldValue))
          .then(this.client
            .put(rlKey)
            .value(JSON.stringify(newValue)))
          .commit()
          .then(result => !!result.succeeded);
        if (success) {
          break;
        }
      }

      if (!success) {
        throw new RateLimiterQueueError('Could not set new value in a transaction.');
      }
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

module.exports = RateLimiterEtcd;
