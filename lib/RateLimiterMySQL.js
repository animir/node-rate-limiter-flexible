const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMySQL extends RateLimiterStoreAbstract {
  /**
   *
   * @param {Object} opts
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: anySqlClient,
   * }
   */
  constructor(opts) {
    super(opts);

    this.client = opts.storeClient;
    this.dbName = opts.dbName;
    this.tableName = opts.tableName;

    this._tableCreated = false;
    this.client.query(`CREATE DATABASE IF NOT EXISTS ${this.dbName};`, (errDb) => {
      if (errDb) {
        throw errDb;
      } else {
        this.client.query(this._getCreateTableStmt(), (err) => {
          if (err) {
            throw err;
          } else {
            this._tableCreated = true;
            this._clearExpiredHourAgo();
          }
        });
      }
    });
  }

  _clearExpiredHourAgo() {
    this._clearExpiredTimeoutId = setTimeout(() => {
      const expire = Date.now() - 3600000;
      this.client.query(`DELETE FROM ${this.tableName} WHERE expire < ?`, [expire], () => {
        this._clearExpiredHourAgo();
      });
    }, 300000);
    this._clearExpiredTimeoutId.unref();
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} (` +
      '`key` VARCHAR(255) CHARACTER SET utf8 NOT NULL,' +
      '`points` INT(9) NOT NULL default 0,' +
      '`expire` BIGINT UNSIGNED NOT NULL,' +
      'PRIMARY KEY (`key`)' +
      ') ENGINE = INNODB;';
  }

  get dbName() {
    return this._dbName;
  }

  set dbName(value) {
    this._dbName = typeof value === 'undefined' ? 'rtlmtrflx' : value;
  }

  get tableName() {
    return this._tableName;
  }

  set tableName(value) {
    this._tableName = typeof value === 'undefined' ? `${this.dbName}.${this.keyPrefix}` : `${this.dbName}.${value}`;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();
    const [row] = result;

    res.isFirstInDuration = changedPoints === row.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : row.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = Math.max(row.expire - Date.now(), 0);

    return res;
  }

  _upsertTransaction(isPool, conn, resolve, reject, key, points, msDuration, forceExpire) {
    conn.query('BEGIN', (errBegin) => {
      if (errBegin) {
        conn.rollback(() => {
          if (isPool) {
            conn.release();
          }
        });

        return reject(errBegin);
      }

      const dateNow = Date.now();
      const newExpire = dateNow + msDuration;

      let q;
      let values;
      if (forceExpire) {
        q = `INSERT INTO ?? VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            points = ?, 
            expire = ?;`;
        values = [
          this.tableName, key, points, newExpire,
          points,
          newExpire,
        ];
      } else {
        q = `INSERT INTO ?? VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            points = IF(expire <= ?, ?, points + (?)), 
            expire = IF(expire <= ?, ?, expire);`;
        values = [
          this.tableName, key, points, newExpire,
          dateNow, points, points,
          dateNow, newExpire,
        ];
      }

      conn.query(q, values, (errUpsert) => {
        if (errUpsert) {
          conn.rollback(() => {
            if (isPool) {
              conn.release();
            }
          });

          return reject(errUpsert);
        }
        conn.query('SELECT points, expire FROM ?? WHERE `key` = ?;', [this.tableName, key], (errSelect, res) => {
          if (errSelect) {
            conn.rollback(() => {
              if (isPool) {
                conn.release();
              }
            });

            return reject(errSelect);
          }

          conn.query('COMMIT', (err) => {
            if (err) {
              conn.rollback(() => {
                if (isPool) {
                  conn.release();
                }
              });

              return reject(err);
            }
            if (isPool) {
              conn.release();
            }
            resolve(res);
          });
        });
      });
    });
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this._tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      // Pool support
      if (typeof this.client.getConnection === 'function') {
        this.client.getConnection((errConn, conn) => {
          if (errConn) {
            return reject(errConn);
          }

          this._upsertTransaction(true, conn, resolve, reject, key, points, msDuration, forceExpire);
        });
      } else {
        this._upsertTransaction(false, this.client, resolve, reject, key, points, msDuration, forceExpire);
      }
    });
  }

  _get(rlKey) {
    if (!this._tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    const q = 'SELECT points, expire FROM ?? WHERE `key` = ? AND `expire` > ?';

    return new Promise((resolve, reject) => {
      this.client.query(
        q,
        [this.tableName, rlKey, Date.now()],
        (err, res) => {
          if (err) {
            reject(err);
          } else if (res.length === 0) {
            resolve(null);
          } else {
            resolve(res);
          }
        } // eslint-disable-line
      );
    });
  }
}

module.exports = RateLimiterMySQL;
