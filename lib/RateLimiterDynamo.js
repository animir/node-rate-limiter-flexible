const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

class RateLimiterDynamo extends RateLimiterStoreAbstract {

    constructor(opts, cb = null) {
        super(opts);
        this.client = opts.storeClient;
        this.tableName = opts.tableName;
        this.tableCreated = false;
        
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
      
      return new Promise((resolve, reject) => {

        this._client.createTable(params)
        .then( (data) => {
          resolve(data)
        })
        .catch( (err) => {
          reject(err);
        });

      });
    }


}

module.exports = RateLimiterDynamo;