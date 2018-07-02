const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterPostgres extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: postgresClient,
   * }
   */
  constructor(opts) {
    super(opts);

    this.client = opts.storeClient;
    this.tableName = opts.tableName;

    this._tableCreated = false;

    this.client.query(`${this._getCreateTableStmt()}`)
      .then(() => {
        this._tableCreated = true;
        this._clearExpiredHourAgo();
      })
      .catch((err) => {
        if (err.code === '23505') {
          // Error: duplicate key value violates unique constraint "pg_type_typname_nsp_index"
          // Postgres doesn't handle concurrent table creation
          // It is supposed, that table is created by another worker
          this._tableCreated = true;
          this._clearExpiredHourAgo();
        }
      });
  }

  /**
   * Delete all rows expired 1 hour ago once per 5 minutes
   *
   * @private
   */
  _clearExpiredHourAgo() {
    this._clearExpiredTimeoutId = setTimeout(() => {
      const expire = new Date(Date.now() - 3600000);
      const q = {
        name: 'rlflx-clear-expired',
        text: `DELETE FROM ${this.tableName} WHERE expire < $1`,
        values: [expire],
      };
      this.client.query(q)
        .then(() => {
          this._clearExpiredHourAgo();
        })
        .catch(() => {
          // Deleting expired query is not critical
          this._clearExpiredHourAgo();
        });
    }, 300000);
    this._clearExpiredTimeoutId.unref();
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} ( 
      key varchar(255) PRIMARY KEY,
      points integer NOT NULL DEFAULT 0,
      expire timestamp NOT NULL
    );`;
  }

  get tableName() {
    return this._tableName;
  }

  set tableName(value) {
    this._tableName = typeof value === 'undefined' ? this.keyPrefix : value;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();
    const row = result.rows[0];

    res.isFirstInDuration = changedPoints === row.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : row.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = Math.max(new Date(row.expire).getTime() - Date.now(), 0);

    return res;
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this._tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    const newExpire = new Date(Date.now() + msDuration);
    const expireQ = forceExpire
      ? ' $3 '
      : ` CASE
             WHEN ${this.tableName}.expire < $4 THEN $3
             ELSE ${this.tableName}.expire
            END `;
    const q = {
      name: forceExpire ? 'rlflx-upsert-force' : 'rlflx-upsert',
      text: `
            INSERT INTO ${this.tableName} VALUES ($1, $2, $3)
              ON CONFLICT(key) DO UPDATE SET
                points = CASE
                          WHEN ${this.tableName}.expire < $4 THEN $2
                          ELSE ${this.tableName}.points + ($2)
                         END,
                expire = ${expireQ}
            RETURNING points, expire;`,
      values: [key, points, newExpire, new Date()],
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
            SELECT points, expire FROM ${this.tableName} WHERE key = $1;`,
        values: [rlKey],
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
