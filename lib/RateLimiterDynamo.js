const RateLimiterRes = require("./RateLimiterRes");
const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

/**
 * Implementation of RateLimiterStoreAbstract using DynamoDB.
 * @class RateLimiterDynamo
 * @extends RateLimiterStoreAbstract
 */
class RateLimiterDynamo extends RateLimiterStoreAbstract {

    /**
     * Constructs a new instance of the class.
     * The storeClient MUST be an instance of AWS.DynamoDB NOT of AWS.DynamoDBClient.
     *
     * @param {Object} opts - The options for the constructor.
     * @param {function} cb - The callback function (optional).
     * @return {void}
     */
    constructor(opts, cb = null) {
        super(opts);
        this.client = opts.storeClient;
        this.tableName = opts.tableName;
        this.tableCreated = opts.tableCreated;
        
        if (!this.tableCreated) {
          this._createTable()
          .then((data) => {
            this.tableCreated = true;
            // Callback invocation
            if (typeof cb === 'function') {
              cb();
            }
          })
          .catch( err => {
            //callback invocation
            if (typeof cb === 'function') {
              cb(err);
            } else {
              throw err;
            }
          });

        } else {
          if(typeof cb === 'function') {
            cb();
          }
        }
    }

    get tableName() {
        return this._tableName;
    }

    set tableName(value) {
        this._tableName = typeof value === 'undefined' ? 'node-rate-limiter-flexible' : value;
    }

    get tableCreated() {
        return this._tableCreated
    }
    
    set tableCreated(value) {
        this._tableCreated = typeof value === 'undefined' ? false : !!value;
    }

    /**
     * Creates a table in the database.
     *
     * @return {Promise} A promise that resolves with the result of creating the table.
     */
    _createTable() {

      const params = {
        TableName: this.tableName,
        AttributeDefinitions: [
          {
            AttributeName: 'key',
            AttributeType: 'S'
          }
        ],
        KeySchema: [
          {
            AttributeName: 'key',
            KeyType: 'HASH'
          }
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      };
      
      return new Promise((resolve, reject) => {
        this._client.createTable(params)
        .then((data) => {
          resolve(date);
        })
        .catch((err) => {
          // If the table already exists in the database resolve
          if (err.__type.includes('ResourceInUseException')) {
            resolve();
          } else {
            reject(err);
          }
        })
      });
    }

    /**
     * Retrieves an item from the table.
     *
     * @param {string} rlKey - The key of the item to retrieve.
     * @return {Promise} A promise that resolves with the retrieved item.
     */
    _get(rlKey) {

      if (!this.tableCreated) {
        return Promise.reject(Error('Table is not created yet'));
      }

      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        }
      };
      
      return new Promise((resolve, reject) => {
        this._client.getItem(params)
        .then((data) => {
          // The item exists if data.Item is not null
          if (data.Item) {
            resolve(data.Item);
          } else {
            resolve(null);
          }
        })
        .catch((err) => {
          reject(err);
        });
      });
    }

    /**
     * Deletes an item from the table.
     *
     * @param {string} rlKey - the key of the item to be deleted
     * @return {Promise} a promise that resolves when the item is deleted
     */
    _delete(rlKey) {

      if (!this.tableCreated) {
        return Promise.reject(Error('Table is not created yet'));
      }

      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        }
      }

      return new Promise((resolve, reject) => {
        this._client.deleteItem(params)
        .then((data) => {
          if(data.$metadata.httpStatusCode === 200) {
            resolve(true);
          } else {
            resolve(false);
          }
        })
        .catch((err) => {
          reject(err);
        });
      });
    }

    /**
     * Implemented with DynamoDB Atomic Counters.
     * From the documentation: "UpdateItem calls are naturally serialized within DynamoDB, so there are no race condition concerns with making multiple simultaneous calls."
     * See: https://aws.amazon.com/it/blogs/database/implement-resource-counters-with-amazon-dynamodb/
     * @param {*} rlKey 
     * @param {*} points 
     * @param {*} msDuration 
     * @param {*} forceExpire 
     * @param {*} options 
     * @returns 
     */
    _upsert(rlKey, points, msDuration, forceExpire = false, options = {}) {

      if (!this.tableCreated) {
        return Promise.reject(Error('Table is not created yet'));
      }
      
      const dateNow = Date.now();
      const newExpire = msDuration > 0 ? dateNow + msDuration : null;

      const updateValue = {
        points: points,
        expire: newExpire
      };

      //fix this
      if (!forceExpire) {
        updateValue.points = 
      }

      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        },
        UpdateExpression: 'SET points = :points, expire = :expire',
        ExpressionAttributeValues: {
          ':points': {N: updateValue.points.toString()},
          ':expire': {N: updateValue.newExpire.toString()}
        },
        ReturnValues: 'ALL_NEW'
      };

      return new Promise((resolve, reject) => {
        this._client.updateItem(params)
        .then((data) => {
          resolve(data.Attributes);
        })
        .catch((err) => {
          reject(err);
        });
      });
      
    }

    /**
     * Generate a RateLimiterRes object based on the provided parameters.
     *
     * @param {string} rlKey - The key for the rate limiter.
     * @param {number} changedPoints - The number of points that have changed.
     * @param {Object} result - The result object containing the points and expire properties.
     * @returns {RateLimiterRes} - The generated RateLimiterRes object.
     */
    _getRateLimiterRes(rlKey, changedPoints, result) {

      const points = Number(result?.points?.N);
      const expire = Number(result?.expire?.N);

      const res = new RateLimiterRes();
      res.isFirstInDuration = changedPoints === points;
      res.consumedPoints = res.isFirstInDuration ? changedPoints : points;
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      res.msBeforeNext = expire ? Math.max(expire - Date.now(), 0) : -1;

      return res;
    }


}

module.exports = RateLimiterDynamo;