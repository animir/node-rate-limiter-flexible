const RateLimiterRes = require("./RateLimiterRes");
const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

class RateLimiterDynamo extends RateLimiterStoreAbstract {

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
     * 
     * @returns {Promise<any>}
     * @private
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
      
      return this._client.createTable(params);
    }

    _get(rlKey) {
      const params = {
        TableName: this.tableName,
        Key: {
          key: {S: rlKey}
        }
      };

      return this._client.getItem(params);
    }

    _getRateLimiterRes(rlKey, changedPoints, result) {
      const res = new RateLimiterRes();

      const points = Number(result?.Item?.points?.N);
      const expire = Number(result?.Item?.expire?.N);

      res.isFirstInDuration = changedPoints === points;
      res.consumedPoints = res.isFirstInDuration ? changedPoints : points;
      res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
      res.msBeforeNext = expire ? Math.max(expire - Date.now(), 0) : -1;

      return res;
    }
}

module.exports = RateLimiterDynamo;