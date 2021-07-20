const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

/**
 * Get MongoDB driver version as upsert options differ
 * @params {Object} Client instance
 * @returns {Number|undefined} Major version
 */
function getDriverVersion(client) {
  try {
    const { version } = client.topology.s.options.metadata.driver;
    const majorVersion = parseInt(version);

    return majorVersion;
  } catch (err) {
    return undefined;
  }
}

class RateLimiterMongo extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   indexKeyPrefix: {attr1: 1, attr2: 1}
   *   ... see other in RateLimiterStoreAbstract
   *
   *   mongo: MongoClient
   * }
   */
  constructor(opts) {
    super(opts);

    this.dbName = opts.dbName;
    this.tableName = opts.tableName;
    this.indexKeyPrefix = opts.indexKeyPrefix;

    if (opts.mongo) {
      this.client = opts.mongo;
    } else {
      this.client = opts.storeClient;
    }
    if (typeof this.client.then === 'function') {
      // If Promise
      this.client
        .then((conn) => {
          this.client = conn;
          this._initCollection();
          this._driverVersion = getDriverVersion(this.client);
        });
    } else {
      this._initCollection();
      this._driverVersion = getDriverVersion(this.client);
    }
  }

  get dbName() {
    return this._dbName;
  }

  set dbName(value) {
    this._dbName = typeof value === 'undefined' ? RateLimiterMongo.getDbName() : value;
  }

  static getDbName() {
    return 'node-rate-limiter-flexible';
  }

  get tableName() {
    return this._tableName;
  }

  set tableName(value) {
    this._tableName = typeof value === 'undefined' ? this.keyPrefix : value;
  }

  get client() {
    return this._client;
  }

  set client(value) {
    if (typeof value === 'undefined') {
      throw new Error('mongo is not set');
    }
    this._client = value;
  }

  get indexKeyPrefix() {
    return this._indexKeyPrefix;
  }

  set indexKeyPrefix(obj) {
    this._indexKeyPrefix = obj || {};
  }

  _initCollection() {
    const db = typeof this.client.db === 'function'
      ? this.client.db(this.dbName)
      : this.client;

    const collection = db.collection(this.tableName);
    collection.createIndex({ expire: -1 }, { expireAfterSeconds: 0 });
    collection.createIndex(Object.assign({}, this.indexKeyPrefix, { key: 1 }), { unique: true });

    this._collection = collection;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();

    let doc;
    if (typeof result.value === 'undefined') {
      doc = result;
    } else {
      doc = result.value;
    }

    res.isFirstInDuration = doc.points === changedPoints;
    res.consumedPoints = doc.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = doc.expire !== null
      ? Math.max(new Date(doc.expire).getTime() - Date.now(), 0)
      : -1;

    return res;
  }

  _upsert(key, points, msDuration, forceExpire = false, options = {}) {
    if (!this._collection) {
      return Promise.reject(Error('Mongo connection is not established'));
    }

    const docAttrs = options.attrs || {};

    let where;
    let upsertData;
    if (forceExpire) {
      where = { key };
      where = Object.assign(where, docAttrs);
      upsertData = {
        $set: {
          key,
          points,
          expire: msDuration > 0 ? new Date(Date.now() + msDuration) : null,
        },
      };
      upsertData.$set = Object.assign(upsertData.$set, docAttrs);
    } else {
      where = {
        $or: [
          { expire: { $gt: new Date() } },
          { expire: { $eq: null } },
        ],
        key,
      };
      where = Object.assign(where, docAttrs);
      upsertData = {
        $setOnInsert: {
          key,
          expire: msDuration > 0 ? new Date(Date.now() + msDuration) : null,
        },
        $inc: { points },
      };
      upsertData.$setOnInsert = Object.assign(upsertData.$setOnInsert, docAttrs);
    }

    // Options for collection updates differ between driver versions
    const upsertOptions = {
      upsert: true,
    };
    if (this._driverVersion >= 4) {
      upsertOptions.returnDocument = 'after';
    } else {
      upsertOptions.returnOriginal = false;
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
        upsertOptions
      ).then((res) => {
        resolve(res);
      }).catch((errUpsert) => {
        if (errUpsert && errUpsert.code === 11000) { // E11000 duplicate key error collection
          const replaceWhere = Object.assign({ // try to replace OLD limit doc
            $or: [
              { expire: { $lte: new Date() } },
              { expire: { $eq: null } },
            ],
            key,
          }, docAttrs);

          const replaceTo = {
            $set: Object.assign({
              key,
              points,
              expire: msDuration > 0 ? new Date(Date.now() + msDuration) : null,
            }, docAttrs)
          };

          this._collection.findOneAndUpdate(
            replaceWhere,
            replaceTo,
            upsertOptions
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

  _get(rlKey, options = {}) {
    if (!this._collection) {
      return Promise.reject(Error('Mongo connection is not established'));
    }

    const docAttrs = options.attrs || {};

    const where = Object.assign({
      key: rlKey,
      $or: [
        { expire: { $gt: new Date() } },
        { expire: { $eq: null } },
      ],
    }, docAttrs);

    return this._collection.findOne(where);
  }

  _delete(rlKey, options = {}) {
    if (!this._collection) {
      return Promise.reject(Error('Mongo connection is not established'));
    }

    const docAttrs = options.attrs || {};
    const where = Object.assign({ key: rlKey }, docAttrs);

    return this._collection.deleteOne(where)
      .then(res => res.deletedCount > 0);
  }
}

module.exports = RateLimiterMongo;
