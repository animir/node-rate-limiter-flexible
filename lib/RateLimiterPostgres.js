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
   *   tableName: 'string',
   * }
   */
  constructor(opts, cb = null) {
    super(opts);

    this.client = opts.storeClient;
    this.tableName = opts.tableName;

    this.clearExpiredByTimeout = opts.clearExpiredByTimeout;

    this._tableCreated = false;

    this.client.query(`${this._getCreateTableStmt()}`)
      .then(() => {
        this._tableCreated = true;
        if (this.clearExpiredByTimeout) {
          this._clearExpiredHourAgo();
        }

        if (typeof cb === 'function') {
          cb();
        }
      })
      .catch((err) => {
        if (err.code === '23505') {
          // Error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
          // Postgres doesn't handle concurrent table creation
          // It is supposed, that table is created by another worker
          this._tableCreated = true;
          if (this.clearExpiredByTimeout) {
            this._clearExpiredHourAgo();
          }
          if (typeof cb === 'function') {
            cb();
          }
        } else {
          if (typeof cb === 'function') {
            cb(err);
          } else {
            throw err;
          }
        }
      });
  }

  clearExpired(expire) {
    return new Promise((resolve) => {
      const q = {
        name: 'rlflx-clear-expired',
        text: `DELETE FROM ${this.tableName} WHERE expire < $1`,
        values: [expire],
      };
      this.client.query(q)
        .catch(() => {
          // Deleting expired query is not critical
        })
        .finally(() => {
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
      this.clearExpired(Date.now() - 3600000)
        .then(() => {
          this._clearExpiredHourAgo();
        });
    }, 300000);
    this._clearExpiredTimeoutId.unref();
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} ( 
      key varchar(255) PRIMARY KEY,
      points integer NOT NULL DEFAULT 0,
      expire bigint NOT NULL
    );`;
  }

  get tableName() {
    return this._tableName;
  }

  set tableName(value) {
    this._tableName = typeof value === 'undefined' ? this.keyPrefix : value;
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
    res.msBeforeNext = Math.max(row.expire - Date.now(), 0);

    return res;
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this._tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    const newExpire = Date.now() + msDuration;
    const expireQ = forceExpire
      ? ' $3 '
      : ` CASE
             WHEN ${this.tableName}.expire <= $4 THEN $3
             ELSE ${this.tableName}.expire
            END `;
    const q = {
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
    };

    return this.client.query(q);
  }

  _get(rlKey) {
    if (!this._tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      const q = {
        name: 'rlflx-get',
        text: `
            SELECT points, expire FROM ${this.tableName} WHERE key = $1 AND expire > $2;`,
        values: [rlKey, Date.now()],
      };

      this.client.query(q)
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
}

module.exports = RateLimiterPostgres;
