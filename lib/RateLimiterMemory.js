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
      res.remainingPoints = this.points - res.consumedPoints;
      resolve(res);
    });
  }

  reward(key, points = 1, options = {}) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const secDuration = this._getKeySecDuration(options);
      const res = this._memoryStorage.incrby(rlKey, -points, secDuration);
      res.remainingPoints = this.points - res.consumedPoints;
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
      res.remainingPoints = this.points - res.consumedPoints;
    }

    return Promise.resolve(res);
  }

  delete(key) {
    return Promise.resolve(this._memoryStorage.delete(this.getKey(key)));
  }
}

module.exports = RateLimiterMemory;

