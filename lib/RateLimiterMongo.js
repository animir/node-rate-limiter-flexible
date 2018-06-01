const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

const getRateLimiterRes = function (points, result) {
  const res = new RateLimiterRes();

  res.isFirstInDuration = result.value === null;
  res.consumedPoints = res.isFirstInDuration ? points : result.value.points;

  res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
  res.msBeforeNext = res.isFirstInDuration
    ? this.duration * 1000
    : Math.max(new Date(result.value.expire).getTime() - Date.now(), 0);

  return res;
};

const afterConsume = function (resolve, reject, rlKey, points, result) {
  const res = getRateLimiterRes.call(this, points, result);

  if (res.consumedPoints > this.points) {
    // Block key for this.blockDuration seconds
    if (this.blockOnPointsConsumed > 0 && res.consumedPoints >= this.blockOnPointsConsumed) {
      this._blockedKeys.add(rlKey, this.blockDuration);
      res.msBeforeNext = this.msBlockDuration;
    }

    reject(res);
  } else if (this.execEvenly && res.msBeforeNext > 0 && !res.isFirstInDuration) {
    const delay = Math.ceil(res.msBeforeNext / (res.remainingPoints + 2));
    setTimeout(resolve, delay, res);
  } else {
    resolve(res);
  }
};

const update = function (key, points) {
  return this._collection.findOneAndUpdate(
    {
      expire: { $gt: new Date() },
      key,
    },
    {
      $inc: { points },
      $setOnInsert: { expire: new Date(Date.now() + (this.duration * 1000)) },
    },
    {
      upsert: true,
      returnNewDocument: true,
    } // eslint-disable-line comma-dangle
  );
};

class RateLimiterMongo extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   mongo: MongoClient
   * }
   */
  constructor(opts) {
    super(opts);

    this.mongo = opts.mongo;
    if (typeof this.mongo.db === 'function') {
      this._collection = this.mongo.db(RateLimiterMongo.getDbName()).collection(this.keyPrefix);
    } else {
      this._collection = this.mongo.db.collection(this.keyPrefix);
    }
    this._collection.ensureIndex({ expire: -1 }, { expireAfterSeconds: 0 });
  }

  static getDbName() {
    return 'node-rate-limiter-flexible'
  }

  get mongo() {
    return this._mongo;
  }

  set mongo(value) {
    if (typeof value === 'undefined') {
      throw new Error('mongo is not set');
    }
    this._mongo = value;
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

      const blockMsBeforeExpire = this.getBlockMsBeforeExpire(rlKey);
      if (blockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, blockMsBeforeExpire));
      }

      update.call(this, rlKey, pointsToConsume)
        .then((res) => {
          afterConsume.call(this, resolve, reject, rlKey, pointsToConsume, res);
        })
        .catch((err) => {
          this.handleError(err, 'consume', resolve, reject, key, pointsToConsume);
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      update.call(this, rlKey, points)
        .then((res) => {
          resolve(getRateLimiterRes.call(this, points, res));
        })
        .catch((err) => {
          this.handleError(err, 'penalty', resolve, reject, key, points);
        });
    });
  }

  reward(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      update.call(this, rlKey, -points)
        .then((res) => {
          resolve(getRateLimiterRes.call(this, points, res));
        })
        .catch((err) => {
          this.handleError(err, 'reward', resolve, reject, key, points);
        });
    });
  }
}

module.exports = RateLimiterMongo;
