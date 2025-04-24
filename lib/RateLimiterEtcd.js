const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');
const EtcdClient = require('./component/EtcdClient/EtcdClient');

const MAX_TRANSACTION_TRIES = 5;

class RateLimiterEtcd extends RateLimiterStoreAbstract {
  /**
   * @param {Object} opts
   */
  constructor(opts) {
    super(opts);

    const host = opts.etcdHost ? opts.etcdHost : 'localhost';
    const port = opts.etcdPort ? opts.etcdPort : 2379;

    this.client = opts.storeClient ? opts.storeClient : new EtcdClient(host, port);
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
      return this.client.setKey(rlKey, newValue);
    }

    // Try to add a new key (returns false if the key was already there)
    const added = await this.client.addKey(rlKey, newValue);

    // If the key already exists, try to update it in a transaction
    if (added === null) {
      let success = false;

      for (let i = 0; i < MAX_TRANSACTION_TRIES; i++) {
        // eslint-disable-next-line no-await-in-loop
        oldValue = await this.client.getKey(rlKey);
        newValue = { points: oldValue.points + points, expire };

        // eslint-disable-next-line no-await-in-loop
        success = await this.client.setKeyIf(rlKey, oldValue, newValue);
        if (success) {
          break;
        }
      }

      if (!success) {
        throw new Error('Could not set new value in a transaction.');
      }
    }

    return newValue;
  }

  /**
   * Resolve with raw result from Store OR null if rlKey is not set
   * or Reject with error
   */
  async _get(rlKey) {
    return this.client.getKey(rlKey);
  }

  /**
   * Resolve with true OR false if rlKey doesn't exist.
   * or Reject with error.
   */
  async _delete(rlKey) {
    const value = await this.client.removeKey(rlKey);
    return value !== null;
  }
}

module.exports = RateLimiterEtcd;
