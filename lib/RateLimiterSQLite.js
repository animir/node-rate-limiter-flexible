const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

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

    // Create table on constructor

    if (!this.tableCreated) {
      this._createDbAndTable().then(() => {
        this.tableCreated = true;

        if (this.clearExpiredByTimeout) {
          this._clearExpiredHourAgo();
        }
        if (typeof cb === 'function') {
          cb();
        }
      }).catch((err) => {
        if (typeof cb === 'function') {
          cb(err);
        } else {
          throw err;
        }
      });


    }
    else {
      if (this.clearExpiredByTimeout) {
        this._clearExpiredHourAgo();
      }
      if (typeof cb === 'function') {
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

  // _upsert(rlKey, points, msDuration, forceExpire = false, debugId) {
  //   if (!this.tableCreated) {
  //     return Promise.reject(Error('Table is not created yet'));
  //   }

  //   console.log(debugId + ':' + '******_upsert******');

  //   return new Promise((resolve, reject) => {
  //     const dateNow = Date.now();
  //     const newExpire = msDuration > 0 ? dateNow + msDuration : null;

  //     this.client.serialize(() => {
  //       if (forceExpire) {
  //         this.client.run(
  //           `INSERT OR REPLACE INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?)`,
  //           [rlKey, points, newExpire],
  //           (err) => {
  //             if (err) reject(err);
  //             else resolve({ points, expire: newExpire });
  //           }
  //         );
  //       } else {

  //         console.log(debugId + ':' + '******_upsert : selecting points,expire ******');

  //         this.client.get(
  //           `SELECT points, expire FROM ${this.tableName} WHERE key = ? AND (expire > ? OR expire IS NULL)`,
  //           [rlKey, dateNow],
  //           (err, row) => {
  //             if (err) {
  //               reject(err);
  //               return;
  //             }
  //             console.log(debugId + ':' + '******_upsert : selecting points,expire => results ******');
  //             console.log({ row });

  //             if (!row) {
  //               // Insert new record
  //               console.log(debugId + ':' + '******_upsert : selecting points,expire => No results ? ******');
  //               this.client.run(
  //                 `INSERT INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?)`,
  //                 [rlKey, points, newExpire],
  //                 (err) => {
  //                   if (err) reject(err);
  //                   else resolve({ points, expire: newExpire });
  //                 }
  //               );
  //               console.log(debugId + ':' + `******_upsert : insert  (key, points, expire) => ${rlKey}, ${points}, ${newExpire} ******`);

  //             } else {
  //               // Update existing record
  //               console.log(debugId + ':' + '******_upsert : selecting points,expire => Yes results ? ******');

  //               this.client.run(
  //                 `UPDATE ${this.tableName} SET points = points + ? WHERE key = ?`,
  //                 [points, rlKey],
  //                 (err) => {
  //                   if (err) reject(err);
  //                   else resolve({ points: row.points + points, expire: row.expire });
  //                 }
  //               );
  //               console.log(debugId + ':' + `******_upsert : UPDATE  (points) => ${points}  ******`);

  //             }
  //           }
  //         );
  //       }
  //     });
  //   });
  // }

  _upsert(rlKey, points, msDuration, forceExpire = false, debugId) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      const dateNow = Date.now();
      const newExpire = msDuration > 0 ? dateNow + msDuration : null;

      this.client.serialize(() => {
        if (forceExpire) {
          this.client.run(
            `INSERT OR REPLACE INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?)`,
            [rlKey, points, newExpire],
            (err) => {
              if (err) reject(err);
              else resolve({ points, expire: newExpire });
            }
          );
        } else {
          // First get existing record
          this.client.get(
            `SELECT points, expire FROM ${this.tableName} WHERE key = ? AND (expire > ? OR expire IS NULL)`,
            [rlKey, dateNow],
            (err, row) => {
              if (err) {
                reject(err);
                return;
              }

              const query = row
                ? `UPDATE ${this.tableName} SET points = points + ? WHERE key = ?`
                : `INSERT INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?)`;
              const params = row
                ? [points, rlKey]
                : [rlKey, points, newExpire];

              // Perform update or insert
              this.client.run(query, params, (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                // Get final state
                this.client.get(
                  `SELECT points, expire FROM ${this.tableName} WHERE key = ?`,
                  [rlKey],
                  (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                  }
                );
              });
            }
          );
        }
      });
    });
  }
  _get(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

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
      return Promise.reject(Error('Table is not created yet'));
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
