const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

const update = function (key, points) {
  if (!this._collection) {
    return Promise.reject(Error('Mongo connection is not established'));
  }
  return this._collection.findOneAndUpdate(
    {
      expire: { $gt: new Date() },
      key,
    },
    {
      $inc: { points },
      $setOnInsert: { expire: new Date(Date.now() + this.msDuration) },
    },
    {
      upsert: true,
      returnOriginal: false,
    } // eslint-disable-line comma-dangle
  );
};

const upsertExpire = function (key, points, msDuration) {
  if (!this._collection) {
    return Promise.reject(Error('Mongo connection is not established'));
  }
  return this._collection.findOneAndUpdate(
    {
      key,
    },
    {
      expire: new Date(Date.now() + msDuration),
      $setOnInsert: { points },
    },
    {
      upsert: true,
      returnOriginal: false,
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
    if (typeof this.mongo.then === 'function') {
      // If Promise
      this.mongo
        .then((conn) => {
          this.mongo = conn;
          this._initCollection();
        });
    } else {
      this._initCollection();
    }
  }

  static getDbName() {
    return 'node-rate-limiter-flexible';
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

  _initCollection() {
    if (typeof this.mongo.db === 'function') {
      this._collection = this.mongo.db(RateLimiterMongo.getDbName()).collection(this.keyPrefix);
    } else {
      this._collection = this.mongo.db.collection(this.keyPrefix);
    }
    this._collection.ensureIndex({ expire: -1 }, { expireAfterSeconds: 0 });
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();

    res.isFirstInDuration = result.value.points === changedPoints;
    res.consumedPoints = result.value.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = Math.max(new Date(result.value.expire).getTime() - Date.now(), 0);

    return res;
  }

  _block(rlKey, initPoints, msDuration) {
    return new Promise((resolve, reject) => {
      upsertExpire.call(this, rlKey, initPoints, msDuration)
        .then(() => {
          resolve(new RateLimiterRes(0, msDuration, initPoints));
        })
        .catch((err) => {
          this._handleError(err, 'block', resolve, reject, this.parseKey(rlKey), initPoints);
        });
    });
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

      const inmemoryBlockMsBeforeExpire = this.getInmemoryBlockMsBeforeExpire(rlKey);
      if (inmemoryBlockMsBeforeExpire > 0) {
        return reject(new RateLimiterRes(0, inmemoryBlockMsBeforeExpire));
      }

      update.call(this, rlKey, pointsToConsume)
        .then((res) => {
          this._afterConsume(resolve, reject, rlKey, pointsToConsume, res);
        })
        .catch((err) => {
          this._handleError(err, 'consume', resolve, reject, key, pointsToConsume);
        });
    });
  }

  penalty(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      update.call(this, rlKey, points)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, points, res));
        })
        .catch((err) => {
          this._handleError(err, 'penalty', resolve, reject, key, points);
        });
    });
  }

  reward(key, points = 1) {
    const rlKey = this.getKey(key);
    return new Promise((resolve, reject) => {
      update.call(this, rlKey, -points)
        .then((res) => {
          resolve(this._getRateLimiterRes(rlKey, -points, res));
        })
        .catch((err) => {
          this._handleError(err, 'reward', resolve, reject, key, -points);
        });
    });
  }
}

module.exports = RateLimiterMongo;
