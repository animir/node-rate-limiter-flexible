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
      let res = this._memoryStorage.incrby(rlKey, pointsToConsume, this.duration);
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

  /**
   * Block any key for secDuration seconds
   *
   * @param key
   * @param secDuration
   */
  block(key, secDuration) {
    const msDuration = secDuration * 1000;
    const initPoints = this.points + 1;

    this._memoryStorage.set(this.getKey(key), initPoints, msDuration);
    return Promise.resolve(new RateLimiterRes(0, msDuration, initPoints));
  }

  get(key) {
    const res = this._memoryStorage.get(this.getKey(key));
    if (res !== null) {
      res.remainingPoints = this.points - res.consumedPoints;
    }

    return Promise.resolve(res);
  }
}

module.exports = RateLimiterMemory;

