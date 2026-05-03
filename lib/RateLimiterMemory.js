const RateLimiterAbstract = require('./RateLimiterAbstract');
const MemoryStorage = require('./component/MemoryStorage/MemoryStorage');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMemory extends RateLimiterAbstract {
  constructor(opts = {}) {
    super(opts);

    this._memoryStorage = new MemoryStorage();
  }
  /**
   *
   * @param key
   * @param pointsToConsume
   * @param {Object} options
   * @returns {Promise<RateLimiterRes>}
   */
  consume(key, pointsToConsume = 1, options = {}) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);
      const secDuration = this._getKeySecDuration(options);
      let res = this._memoryStorage.incrby(rlKey, pointsToConsume, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);

      if (res.consumedPoints > this.points) {
        // Block only first time when consumed more than points
        if (this.blockDuration > 0 && res.consumedPoints <= (this.points + pointsToConsume)) {
          // Block key
          res = this._memoryStorage.set(rlKey, res.consumedPoints, this.blockDuration);
        }
        reject(res);
      } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
        // Execute evenly
        let delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
        if (delay < this.execEvenlyMinDelayMs) {
          delay = res.consumedPoints * this.execEvenlyMinDelayMs;
        }
        // Adjust msBeforeNext to reflect time already waited before resolving
        res.msBeforeNext = Math.max(res.msBeforeNext - delay, 0);

        setTimeout(resolve, delay, res);
      } else {
        resolve(res);
      }
    });
  }

  penalty(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const secDuration = this._getKeySecDuration(options);
      const res = this._memoryStorage.incrby(rlKey, points, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      resolve(res);
    });
  }

  reward(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const secDuration = this._getKeySecDuration(options);
      const res = this._memoryStorage.incrby(rlKey, -points, secDuration);
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      resolve(res);
    });
  }

  /**
   * Block any key for secDuration seconds
   *
   * @param key
   * @param secDuration
   */
  block(key, secDuration) {
    const msDuration = secDuration * 1000;
    const initPoints = this.points + 1;

    this._memoryStorage.set(this.getKey(key), initPoints, secDuration);
    return Promise.resolve(
      new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, initPoints)
    );
  }

  set(key, points, secDuration) {
    const msDuration = (secDuration >= 0 ? secDuration : this.duration) * 1000;

    this._memoryStorage.set(this.getKey(key), points, secDuration);
    return Promise.resolve(
      new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, points)
    );
  }

  get(key) {
    const res = this._memoryStorage.get(this.getKey(key));
    if (res !== null) {
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    }

    return Promise.resolve(res);
  }

  delete(key) {
    return Promise.resolve(this._memoryStorage.delete(this.getKey(key)));
  }

  dump() {
    const storage = [];
    for (const [key, record] of this._memoryStorage._storage) {
      storage.push({
        key: this.parseKey(key),
        value: record.value,
        expiresAt: record.expiresAt,
      });
    }

    return {
      version: 1,
      dumpedAt: Date.now(),
      storage,
    };
  }

  /**
   * Restores rate-limiter state from a previously dumped snapshot.
   *
   * Each entry is classified into one of three buckets:
   *  - **invalid**  – the item is not an object or has a malformed schema (bad key, value or expiry type).
   *  - **expired**  – the item has logically expired based on current timestamp.
   *  - **restored** – the item was valid and successfully loaded into storage.
   *
   * @param {Object}  data            - Snapshot produced by {@link dump}.
   * @param {boolean} [detailResponse=false] - When `true`, each bucket also
   *   carries a `keys` array listing every affected key.
   * @returns {{ invalid, expired, restored } | undefined} Summary counts (and
   *   optionally keys).  Returns `undefined` when `data` fails schema checks.
   */
  restore(data, detailResponse = false) {
    if (!data || typeof data !== 'object' || data.version !== 1) {
      return undefined;
    }

    const response = detailResponse
      ? {
        invalid: { count: 0, keys: [] },
        expired: { count: 0, keys: [] },
        restored: { count: 0, keys: [] },
      }
      : { invalid: 0, expired: 0, restored: 0 };

    /**
     * Increments the named bucket and, in detail mode, appends the key.
     * @param {'invalid'|'expired'|'restored'} bucket
     * @param {string|number} key
     */
    const record = (bucket, key) => {
      if (detailResponse) {
        response[bucket].count += 1;
        response[bucket].keys.push(key);
      } else {
        response[bucket] += 1;
      }
    };

    if (!Array.isArray(data.storage)) {
      return response;
    }

    for (const item of data.storage) {
      if (!item || typeof item !== 'object') {
        //in array if we don't get object we push N/A
        record('invalid', 'N/A');
        continue;
      }

      const isValidKey = typeof item.key === 'string' || typeof item.key === 'number';
      const isValidValue = Number.isFinite(item.value);
      const isValidExpiry = item.expiresAt === null || Number.isFinite(item.expiresAt);

      if (!isValidKey || !isValidValue || !isValidExpiry) {
        record('invalid', item.key);
        continue;
      }

      if (item.expiresAt !== null && item.expiresAt <= Date.now()) {
        record('expired', item.key);
        continue;
      }

      this._memoryStorage._restoreRecord(this.getKey(item.key), item.value, item.expiresAt);
      record('restored', item.key);
    }

    return response;
  }
}

module.exports = RateLimiterMemory;

