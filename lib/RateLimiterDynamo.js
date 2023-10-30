const RateLimiterRes = require("./RateLimiterRes");
const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

class DynamoItem {
  constructor(rlKey, points, expire) {
    this.key = rlKey;
    this.points = points;
    this.expire = expire;
  }
}

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
     * Creates a table in the database. Return null if the table already exists.
     *
     * @return {Promise} A promise that resolves with the result of creating the table.
     */
    async _createTable() {

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
      
      try {
        const data = await this.client.createTable(params);
        return data;
      } catch(err) {
        if (err.__type.includes('ResourceInUseException')) {
          return null;
        } else {
          throw err;
        }
      }
    }

    /**
     * Retrieves an item from the table based on the provided key.
     *
     * @param {string} rlKey - The key used to retrieve the item.
     * @throws {Error} Throws an error if the table is not created yet.
     * @return {DynamoItem|null} - The retrieved item, or null if it doesn't exist.
     */
    async _get(rlKey) {

      if (!this.tableCreated) {
        throw new Error('Table is not created yet');
      }

      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        }
      };
      
      const data = await this.client.getItem(params);
      if(data.Item) {
        return new DynamoItem(
          data.Item.key.S,
          Number(data.Item.points.N),
          Number(data.Item.expire.N)
        );
      } else {
        return null;
      }
    }


    /**
     * Deletes an item from the table based on the given rlKey.
     *
     * @param {string} rlKey - The rlKey of the item to delete.
     * @throws {Error} Throws an error if the table is not created yet.
     * @return {boolean} Returns true if the item was successfully deleted, otherwise false.
     */
    async _delete(rlKey) {

      if (!this.tableCreated) {
        throw new Error('Table is not created yet');
      }

      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        }
      }

      const data = this._client.deleteItem(params);
      return data.$metadata.httpStatusCode === 200;
    }

    /**
     * Implemented with DynamoDB Atomic Counters. 3 calls are made to DynamoDB but each call is atomic.
     * From the documentation: "UpdateItem calls are naturally serialized within DynamoDB, so there are no race condition concerns with making multiple simultaneous calls."
     * See: https://aws.amazon.com/it/blogs/database/implement-resource-counters-with-amazon-dynamodb/
     * @param {*} rlKey 
     * @param {*} points 
     * @param {*} msDuration 
     * @param {*} forceExpire 
     * @param {*} options 
     * @returns 
     */
    async _upsert(rlKey, points, msDuration, forceExpire = false, options = {}) {

      if (!this.tableCreated) {
        throw new Error('Table is not created yet');
      }

      const dateNow = Date.now();
      const newExpire = msDuration > 0 ? dateNow + msDuration : null;

      // Force expire, overwrite points. Create a new entry if not exists
      if (forceExpire) {
        return await this._baseUpsert({
          TableName: this.tableName,
          Key: { key: {S: rlKey} },
          UpdateExpression: 'SET points = :points, expire = :expire',
          ExpressionAttributeValues: {
            ':points': {N: points.toString()},
            ':expire': {N: newExpire.toString()}
          },
          ReturnValues: 'ALL_NEW'
        });
      }

      // First try update, success if entry does not exists
      try {
        return await this._baseUpsert({
          TableName: this.tableName,
          Key: { key: {S: rlKey} },
          UpdateExpression: 'SET points = :new_points, expire = :new_expire',
          ExpressionAttributeValues: {
            ':new_points': {N: points.toString()},
            ':new_expire': {N: newExpire.toString()},
          },
          ConditionExpression: 'attribute_not_exists(points)',
          ReturnValues: 'ALL_NEW'
        });

      } catch (err) {
        // Second try update, success if entry exists and is not expired
        try {
          return await this._baseUpsert({
            TableName: this.tableName,
            Key: { key: {S: rlKey} },
            UpdateExpression: 'SET points = :new_points, expire = :new_expire',
            ExpressionAttributeValues: {
              ':new_points': {N: points.toString()},
              ':new_expire': {N: newExpire.toString()},
              ':where_expire': {N: dateNow.toString()}
            },
            ConditionExpression: 'expire <= :where_expire',
            ReturnValues: 'ALL_NEW'
          });

        } catch (err) {
          // Third try update, success if entry exists and is expired
          return await this._baseUpsert({
            TableName: this.tableName,
            Key: { key: {S: rlKey} },
            UpdateExpression: 'SET points = points + :new_points',
            ExpressionAttributeValues: {
              ':new_points': {N: points.toString()},
              ':where_expire': {N: dateNow.toString()}
            },
            ConditionExpression: 'expire > :where_expire',
            ReturnValues: 'ALL_NEW'
          });
        }
      }
    }
    
    /**
     * Asynchronously upserts data into the table. params is a DynamoDB params object.
     *
     * @param {Object} params - The parameters for the upsert operation.
     * @throws {Error} Throws an error if the table is not created yet.
     * @return {DynamoItem} Returns a DynamoItem object with the updated data.
     */
    async _baseUpsert(params) {

      if (!this.tableCreated) {
        throw new Error('Table is not created yet');
      }
      
      try {
        const data = await this.client.updateItem(params);
        return new DynamoItem(
          data.Attributes.key.S,
          Number(data.Attributes.points.N),
          Number(data.Attributes.expire.N)
        );
      } catch (err) {
        //console.log('_baseUpsert', params, err);
        throw err;
      }
    }

    /**
     * Generate a RateLimiterRes object based on the provided parameters.
     *
     * @param {string} rlKey - The key for the rate limiter.
     * @param {number} changedPoints - The number of points that have changed.
     * @param {DynamoItem} result - The result object of _get() method.
     * @returns {RateLimiterRes} - The generated RateLimiterRes object.
     */
    _getRateLimiterRes(rlKey, changedPoints, result) {

      const res = new RateLimiterRes();
      res.isFirstInDuration = changedPoints === result.points;
      res.consumedPoints = res.isFirstInDuration ? changedPoints : result.points;
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      res.msBeforeNext = result.expire ? Math.max(result.expire - Date.now(), 0) : -1;

      return res;
    }

}

module.exports = RateLimiterDynamo;