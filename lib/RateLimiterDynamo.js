const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");

class RateLimiterDynamo extends RateLimiterStoreAbstract {

    constructor(opts, cb = null) {
        super(opts);
        this.client = opts.storeClient;

        this.dbName = opts.dbName;
        this.tableName = opts.tableName;
        this.indexKeyPrefix = opts.indexKeyPrefix;
    }

    get dbName() {
        return this._dbName;
    }

    set dbName(value) {
        this._dbName = typeof value === 'undefined' ? 'node-rate-limiter-flexible' : value;
    }

    get tableName() {
        return this._tableName;
    }

    set tableName(value) {
        this._tableName = typeof value === 'undefined' ? this.keyPrefix : value;
    }

    get tableCreated() {
        return this._tableCreated
    }
    
    set tableCreated(value) {
        this._tableCreated = typeof value === 'undefined' ? false : !!value;
    }


}

module.exports = RateLimiterDynamo;