const RateLimiterAbstract = require('./RateLimiterAbstract');
const MemoryStorage = require('./component/MemoryStorage/MemoryStorage');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMemory extends RateLimiterAbstract {
  constructor(opts = {}) {
    super(opts);

    this._memoryStorage = new MemoryStorage(opts);
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
      this._memoryStorage.incrby(rlKey, pointsToConsume, secDuration)
        .then((res) => {
          res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);

          if (res.consumedPoints > this.points) {
            // Block only first time when consumed more than points
            if (this.blockDuration > 0 && res.consumedPoints <= (this.points + pointsToConsume)) {
              // Block key
              this._memoryStorage.set(rlKey, res.consumedPoints, this.blockDuration)
                .then((setRes) => {
                  reject(setRes);
                })
                .catch(reject);
            } else {
              reject(res);
            }
          } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
            // Execute evenly
            let delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
            if (delay < this.execEvenlyMinDelayMs) {
              delay = res.consumedPoints * this.execEvenlyMinDelayMs;
            }

            setTimeout(resolve, delay, res);
          } else {
            resolve(res);
          }
        })
        .catch(reject);
    });
  }

  penalty(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      const secDuration = this._getKeySecDuration(options);
      this._memoryStorage.incrby(rlKey, points, secDuration)
        .then((res) => {
          res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
          resolve(res);
        })
        .catch(reject);
    });
  }

  reward(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      const secDuration = this._getKeySecDuration(options);
      this._memoryStorage.incrby(rlKey, -points, secDuration)
        .then((res) => {
          res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
          resolve(res);
        })
        .catch(reject);
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

    return this._memoryStorage.set(this.getKey(key), initPoints, secDuration)
      .then(() => {
        return new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, initPoints);
      });
  }

  set(key, points, secDuration) {
    const msDuration = (secDuration >= 0 ? secDuration : this.duration) * 1000;

    return this._memoryStorage.set(this.getKey(key), points, secDuration)
      .then(() => {
        return new RateLimiterRes(0, msDuration === 0 ? -1 : msDuration, points);
      });
  }

  get(key) {
    const res = this._memoryStorage.get(this.getKey(key));
    if (res !== null) {
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    }

    return Promise.resolve(res);
  }

  delete(key) {
    return this._memoryStorage.delete(this.getKey(key));
  }

  dumpToString() {
    const storage = [];
    for (const [key, record] of this._memoryStorage._storage) {
      storage.push({
        key,
        value: record.value,
        expiresAt: record.expiresAt,
      });
    }

    return JSON.stringify({
      version: 1,
      dumpedAt: Date.now(),
      storage,
    });
  }

  restoreFromString(serialized) {
    let data;
    try {
      data = JSON.parse(serialized);
    } catch (e) {
      return;
    }

    if (!data || data.version !== 1) {
      return;
    }

    if (Array.isArray(data.storage)) {
      data.storage.forEach((item) => {
        this._memoryStorage._restoreRecord(item.key, item.value, item.expiresAt);
      });
    }
  }
}

module.exports = RateLimiterMemory;

