const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");
const RateLimiterRes = require("./RateLimiterRes");

class RateLimiterSQLite extends RateLimiterStoreAbstract {
  /**
   * @callback callback
   * @param {Object} err
   *
   * @param {Object} opts
   * @param {callback} cb
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: sqliteClient, // SQLite database instance
   *   tableName: 'string',
   * }
   */
  constructor(opts, cb = null) {
    super(opts);

    this.client = opts.storeClient;
    this.tableName = opts.tableName;
    this.tableCreated = opts.tableCreated || false;
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout;

    if (!/^[A-Za-z0-9_]*$/.test(this.tableName)) {
      const err = new Error("Table name must contain only letters and numbers");
      if (typeof cb === "function") {
        return cb(err);
      }
      throw err;
    }

    if (!this.tableCreated) {
      this._createDbAndTable()
        .then(() => {
          this.tableCreated = true;

          if (this.clearExpiredByTimeout) {
            this._clearExpiredHourAgo();
          }
          if (typeof cb === "function") {
            cb();
          }
        })
        .catch((err) => {
          if (typeof cb === "function") {
            cb(err);
          } else {
            throw err;
          }
        });
    } else {
      if (this.clearExpiredByTimeout) {
        this._clearExpiredHourAgo();
      }
      if (typeof cb === "function") {
        cb();
      }
    }
  }
  async _createDbAndTable() {
    return new Promise((resolve, reject) => {
      const createTableSQL = this._getCreateTableSQL();
      this.client.run(createTableSQL, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  _getCreateTableSQL() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} (
      key TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      expire INTEGER
    )`;
  }

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

  clearExpired(nowMs) {
    return new Promise((resolve) => {
      this.client.run(
        `DELETE FROM ${this.tableName} WHERE expire < ?`,
        [nowMs],
        () => resolve()
      );
    });
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();
    res.isFirstInDuration = changedPoints === result.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : result.points;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = result.expire
      ? Math.max(result.expire - Date.now(), 0)
      : -1;

    return res;
  }

  async _upsertTransaction(rlKey, points, msDuration, forceExpire) {
    return new Promise((resolve, reject) => {
      const dateNow = Date.now();
      const newExpire = msDuration > 0 ? dateNow + msDuration : null;

      const upsertQuery = forceExpire
        ? `INSERT OR REPLACE INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?) RETURNING points, expire;`
        : `
          INSERT INTO ${this.tableName} (key, points, expire)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            points = CASE
              WHEN expire IS NULL OR expire > ? THEN points + excluded.points
              ELSE excluded.points
            END,
            expire = CASE
              WHEN expire IS NULL OR expire > ? THEN expire
              ELSE excluded.expire
            END
          RETURNING points, expire;
        `;

      const upsertParams = forceExpire
        ? [rlKey, points, newExpire]
        : [rlKey, points, newExpire, dateNow, dateNow];

      this.client.serialize(() => {
        this.client.run("SAVEPOINT rate_limiter_trx;", (savepointErr) => {
          if (savepointErr) return reject(savepointErr);

          this.client.get(upsertQuery, upsertParams, (queryErr, row) => {
            if (queryErr) {
              return this.client.run(
                "ROLLBACK TO SAVEPOINT rate_limiter_trx;",
                () => reject(queryErr)
              );
            }

            this.client.run("RELEASE SAVEPOINT rate_limiter_trx;", () =>
              resolve(row)
            );
          });
        });
      });
    });
  }
  _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (!this.tableCreated) {
      return Promise.reject(Error("Table is not created yet"));
    }
    return this._upsertTransaction(rlKey, points, msDuration, forceExpire);
  }
  _get(rlKey) {
    return new Promise((resolve, reject) => {
      this.client.get(
        `SELECT points, expire FROM ${this.tableName} WHERE key = ? AND (expire > ? OR expire IS NULL)`,
        [rlKey, Date.now()],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row || null);
          }
        }
      );
    });
  }

  _delete(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(Error("Table is not created yet"));
    }

    return new Promise((resolve, reject) => {
      this.client.run(
        `DELETE FROM ${this.tableName} WHERE key = ?`,
        [rlKey],
        function (err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        }
      );
    });
  }
}

module.exports = RateLimiterSQLite;
