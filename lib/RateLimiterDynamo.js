const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

class RateLimiterDynamo extends RateLimiterStoreAbstract {

    constructor(opts, cb = null) {
        super(opts);
        this.client = opts.storeClient;

        this.tableName = opts.tableName;

        this.tableCreated = false;

        this._sendCommand(this._getCreateTableCommand)
        .then(() => {
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
        })


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
    _sendCommand(command) {
      return new Promise((resolve, reject) => {
        this._client.send(command)
        .then( data => {
          resolve(data);
        } )
        .catch( (err) => {
          reject(err);
        })
      });
    }

    /**
     * 
     * @returns {Object}
     * @private
     */
    _getCreateTableCommand() {

      return {
        TableName: this.tableName,
        KeySchema: [
          {
              AttributeName: 'key',
              KeyType: 'HASH'
          },
          {
              AttributeName: 'points',
              KeyType: 'RANGE'
          },
          {
              AttributeName: 'expire',
              KeyType: 'RANGE'
          }
        ],
        AttributeDefinitions: [
          {
              AttributeName: 'key',
              AttributeType: 'S'
          },
          {
              AttributeName: 'points',
              AttributeType: 'N'
          },
          {
              AttributeName: 'expire',
              AttributeType: 'N'
          },
        ],
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5
        }
      };
    }


}

module.exports = RateLimiterDynamo;