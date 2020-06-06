const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterPostgres extends RateLimiterStoreAbstract {
  /**
   * @callback callback
   * @param {Object} err
   *
   * @param {Object} opts
   * @param {callback} cb
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: postgresClient,
   *   storeType: 'knex', // required only for Knex instance
   *   tableName: 'string',
   * }
   */
  constructor(opts, cb = null) {
    super(opts);

    this.client = opts.storeClient;
    this.clientType = opts.storeType;

    this.tableName = opts.tableName;

    this.clearExpiredByTimeout = opts.clearExpiredByTimeout;

    this.tableCreated = opts.tableCreated;
    if (!this.tableCreated) {
      this._createTable()
        .then(() => {
          this.tableCreated = true;
          if (this.clearExpiredByTimeout) {
            this._clearExpiredHourAgo();
          }
          if (typeof cb === 'function') {
            cb();
          }
        })
        .catch((err) => {
          if (typeof cb === 'function') {
            cb(err);
          } else {
            throw err;
          }
        });
    } else {
      if (typeof cb === 'function') {
        cb();
      }
    }
  }

  clearExpired(expire) {
    return new Promise((resolve) => {
      const q = {
        name: 'rlflx-clear-expired',
        text: `DELETE FROM ${this.tableName} WHERE expire < $1`,
        values: [expire],
      };
      this._query(q)
        .then(() => {
          resolve();
        })
        .catch(() => {
          // Deleting expired query is not critical
          resolve();
        });
    });
  }

  /**
   * Delete all rows expired 1 hour ago once per 5 minutes
   *
   * @private
   */
  _clearExpiredHourAgo() {
    if (this._clearExpiredTimeoutId) {
      clearTimeout(this._clearExpiredTimeoutId);
    }
    this._clearExpiredTimeoutId = setTimeout(() => {
      this.clearExpired(Date.now() - 3600000) // Never rejected
        .then(() => {
          this._clearExpiredHourAgo();
        });
    }, 300000);
    this._clearExpiredTimeoutId.unref();
  }

  /**
   *
   * @return Promise<any>
   * @private
   */
  _getConnection() {
    switch (this.clientType) {
      case 'pool':
        return Promise.resolve(this.client);
      case 'sequelize':
        return this.client.connectionManager.getConnection();
      case 'knex':
        return this.client.client.acquireConnection();
      default:
        return Promise.resolve(this.client);
    }
  }

  _releaseConnection(conn) {
    switch (this.clientType) {
      case 'pool':
        return true;
      case 'sequelize':
        return this.client.connectionManager.releaseConnection(conn);
      case 'knex':
        return this.client.client.releaseConnection(conn);
      default:
        return true;
    }
  }

  /**
   *
   * @returns {Promise<any>}
   * @private
   */
  _createTable() {
    return new Promise((resolve, reject) => {
      this._query({
        text: this._getCreateTableStmt(),
      })
        .then(() => {
          resolve();
        })
        .catch((err) => {
          if (err.code === '23505') {
            // Error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
            // Postgres doesn't handle concurrent table creation
            // It is supposed, that table is created by another worker
            resolve();
          } else {
            reject(err);
          }
        });
    });
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} ( 
      key varchar(255) PRIMARY KEY,
      points integer NOT NULL DEFAULT 0,
      expire bigint
    );`;
  }

  get clientType() {
    return this._clientType;
  }

  set clientType(value) {
    const constructorName = this.client.constructor.name;

    if (typeof value === 'undefined') {
      if (constructorName === 'Client') {
        value = 'client';
      } else if (
        constructorName === 'Pool' ||
        constructorName === 'BoundPool'
      ) {
        value = 'pool';
      } else if (constructorName === 'Sequelize') {
        value = 'sequelize';
      } else {
        throw new Error('storeType is not defined');
      }
    }

    this._clientType = value.toLowerCase();
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

  get clearExpiredByTimeout() {
    return this._clearExpiredByTimeout;
  }

  set clearExpiredByTimeout(value) {
    this._clearExpiredByTimeout = typeof value === 'undefined' ? true : Boolean(value);
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();
    const row = result.rows[0];

    res.isFirstInDuration = changedPoints === row.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : row.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = row.expire
      ? Math.max(row.expire - Date.now(), 0)
      : -1;

    return res;
  }

  _query(q) {
    const prefix = this.tableName.toLowerCase();
    const queryObj = { name: `${prefix}:${q.name}`, text: q.text, values: q.values };
    return new Promise((resolve, reject) => {
      this._getConnection()
        .then((conn) => {
          conn.query(queryObj)
            .then((res) => {
              resolve(res);
              this._releaseConnection(conn);
            })
            .catch((err) => {
              reject(err);
              this._releaseConnection(conn);
            });
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    const newExpire = msDuration > 0 ? Date.now() + msDuration : null;
    const expireQ = forceExpire
      ? ' $3 '
      : ` CASE
             WHEN ${this.tableName}.expire <= $4 THEN $3
             ELSE ${this.tableName}.expire
            END `;

    return this._query({
      name: forceExpire ? 'rlflx-upsert-force' : 'rlflx-upsert',
      text: `
            INSERT INTO ${this.tableName} VALUES ($1, $2, $3)
              ON CONFLICT(key) DO UPDATE SET
                points = CASE
                          WHEN ${this.tableName}.expire <= $4 THEN $2
                          ELSE ${this.tableName}.points + ($2)
                         END,
                expire = ${expireQ}
            RETURNING points, expire;`,
      values: [key, points, newExpire, Date.now()],
    });
  }

  _get(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      this._query({
        name: 'rlflx-get',
        text: `
            SELECT points, expire FROM ${this.tableName} WHERE key = $1 AND (expire > $2 OR expire IS NULL);`,
        values: [rlKey, Date.now()],
      })
        .then((res) => {
          if (res.rowCount === 0) {
            res = null;
          }
          resolve(res);
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  _delete(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return this._query({
      name: 'rlflx-delete',
      text: `DELETE FROM ${this.tableName} WHERE key = $1`,
      values: [rlKey],
    })
      .then(res => res.rowCount > 0);
  }
}

module.exports = RateLimiterPostgres;
