const RateLimiterInterface = require('./RateLimiterAbstract');
const MemoryStorage = require('./component/MemoryStorage/MemoryStorage');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMemory extends RateLimiterInterface {
  constructor(opts = {}) {
    super(opts);

    this._memoryStorage = new MemoryStorage();
  }
  /**
   *
   * @param key
   * @param pointsToConsume
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = RateLimiterInterface.getKey(key);
      const isFirstInDuration = this._memoryStorage.get(rlKey) === null;
      const storageRes = this._memoryStorage.incrby(rlKey, pointsToConsume, this.duration);
      const res = new RateLimiterRes(this.points - storageRes.consumedPoints, storageRes.msBeforeNext);

      if (storageRes.consumedPoints > this.points) {
        reject(new RateLimiterRes(0, storageRes.msBeforeNext));
      } else {
        if (this.execEvenly && storageRes.msBeforeNext > 0 && !isFirstInDuration) {
          const delay = Math.ceil(storageRes.msBeforeNext / ((this.points - storageRes.consumedPoints) + 2));

          setTimeout(resolve, delay, res);
        } else {
          resolve(res);
        }
      }
    });
  }

  penalty(key, points = 1) {
    const rlKey = RateLimiterInterface.getKey(key);
    return new Promise((resolve, reject) => {
      const res = this._memoryStorage.incrby(rlKey, points, this.duration);
      resolve(new RateLimiterRes(this.points - res.consumedPoints, res.msBeforeNext));
    });
  }

  reward(key, points = 1) {
    const rlKey = RateLimiterInterface.getKey(key);
    return new Promise((resolve, reject) => {
      const res = this._memoryStorage.incrby(rlKey, -points, this.duration);
      resolve(new RateLimiterRes(this.points - res.consumedPoints, res.msBeforeNext));
    });
  }
}

module.exports = RateLimiterMemory;

