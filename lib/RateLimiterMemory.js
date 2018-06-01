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
   * @returns {Promise<any>}
   */
  consume(key, pointsToConsume = 1) {
    return new Promise((resolve, reject) => {
      const rlKey = this.getKey(key);
      const res = this._memoryStorage.incrby(rlKey, pointsToConsume, this.duration);
      res.remainingPoints = this.points - res.consumedPoints;

      if (res.consumedPoints > this.points) {
        reject(new RateLimiterRes(0, res.msBeforeNext));
      } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
        const delay = Math.ceil(res.msBeforeNext / ((this.points - res.consumedPoints) + 2));

        setTimeout(resolve, delay, res);
      } else {
        resolve(res);
      }
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const res = this._memoryStorage.incrby(rlKey, points, this.duration);
      res.remainingPoints = this.points - res.consumedPoints;
      resolve(res);
    });
  }

  reward(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve) => {
      const res = this._memoryStorage.incrby(rlKey, -points, this.duration);
      res.remainingPoints = this.points - res.consumedPoints;
      resolve(res);
    });
  }
}

module.exports = RateLimiterMemory;

