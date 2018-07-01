const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

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
    let collection;
    if (typeof this.mongo.db === 'function') {
      collection = this.mongo.db(RateLimiterMongo.getDbName()).collection(this.keyPrefix);
    } else {
      collection = this.mongo.db.collection(this.keyPrefix);
    }
    collection.ensureIndex({ expire: -1 }, { expireAfterSeconds: 0 });
    collection.ensureIndex({ key: 1 }, { unique: true });

    this._collection = collection;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();

    let doc;
    if (typeof result.value === 'undefined') {
      [doc] = result.ops; // ops set on replaceOne
    } else {
      doc = result.value;
    }

    res.isFirstInDuration = doc.points === changedPoints;
    res.consumedPoints = doc.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = Math.max(new Date(doc.expire).getTime() - Date.now(), 0);

    return res;
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this._collection) {
      return Promise.reject(Error('Mongo connection is not established'));
    }

    let where;
    let upsertData;
    if (forceExpire) {
      where = { key };
      upsertData = {
        key,
        points,
        expire: new Date(Date.now() + msDuration),
      };
    } else {
      where = {
        expire: { $gt: new Date() },
        key,
      };
      upsertData = {
        $setOnInsert: {
          key,
          expire: new Date(Date.now() + msDuration),
        },
        $inc: { points },
      };
    }

    /*
     * 1. Find actual limit and increment points
     * 2. If limit expired, but Mongo doesn't clean doc by TTL yet, try to replace limit doc completely
     * 3. If 2 or more Mongo threads try to insert the new limit doc, only the first succeed
     * 4. Try to upsert from step 1. Actual limit is created now, points are incremented without problems
     */
    return new Promise((resolve, reject) => {
      this._collection.findOneAndUpdate(
        where,
        upsertData,
        {
          upsert: true,
          returnOriginal: false,
        } // eslint-disable-line comma-dangle
      ).then((res) => {
        resolve(res);
      }).catch((errUpsert) => {
        if (errUpsert && errUpsert.code === 11000) { // E11000 duplicate key error collection
          this._collection.replaceOne(
            {
              expire: { $lte: new Date() }, // try to replace OLD limit doc
              key,
            },
            {
              key,
              points,
              expire: new Date(Date.now() + msDuration),
            },
            {
              upsert: true,
              returnOriginal: false,
            } // eslint-disable-line comma-dangle
          ).then((res) => {
            resolve(res);
          }).catch((errReplace) => {
            if (errReplace && errReplace.code === 11000) { // E11000 duplicate key error collection
              this._upsert(key, points, msDuration, forceExpire)
                .then(res => resolve(res))
                .catch(err => reject(err));
            } else {
              reject(errReplace);
            }
          });
        } else {
          reject(errUpsert);
        }
      });
    });
  }

  _block(rlKey, initPoints, msDuration) {
    return new Promise((resolve, reject) => {
      this._upsert(rlKey, initPoints, msDuration, true)
        .then(() => {
          resolve(new RateLimiterRes(0, msDuration, initPoints));
        })
        .catch((err) => {
          this._handleError(err, 'block', resolve, reject, this.parseKey(rlKey), initPoints);
        });
    });
  }
}

module.exports = RateLimiterMongo;
