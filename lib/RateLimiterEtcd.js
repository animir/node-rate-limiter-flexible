const RateLimiterEtcdTransactionFailedError = require('./component/RateLimiterEtcdTransactionFailedError');
const RateLimiterEtcdNonAtomic = require('./RateLimiterEtcdNonAtomic');

const MAX_TRANSACTION_TRIES = 5;

class RateLimiterEtcd extends RateLimiterEtcdNonAtomic {
  /**
   * Resolve with object used for {@link _getRateLimiterRes} to generate {@link RateLimiterRes}.
   */
  async _upsert(rlKey, points, msDuration, forceExpire = false) {
    const expire = msDuration > 0 ? Date.now() + msDuration : null;

    let newValue = { points, expire };
    let oldValue;

    // If we need to force the expiration, just set the key.
    if (forceExpire) {
      await this.client
        .put(rlKey)
        .value(JSON.stringify(newValue));
    } else {
      // First try to add a new key
      const added = await this.client
        .if(rlKey, 'Version', '===', '0')
        .then(this.client
          .put(rlKey)
          .value(JSON.stringify(newValue)))
        .commit()
        .then(result => !!result.succeeded);

      // If the key already existed, try to update it in a transaction
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
          throw new RateLimiterEtcdTransactionFailedError('Could not set new value in a transaction.');
        }
      }
    }

    return newValue;
  }
}

module.exports = RateLimiterEtcd;
