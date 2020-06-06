const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterMySQL extends RateLimiterStoreAbstract {
  /**
   * @callback callback
   * @param {Object} err
   *
   * @param {Object} opts
   * @param {callback} cb
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *
   *   storeClient: anySqlClient,
   *   storeType: 'knex', // required only for Knex instance
   *   dbName: 'string',
   *   tableName: 'string',
   * }
   */
  constructor(opts, cb = null) {
    super(opts);

    this.client = opts.storeClient;
    this.clientType = opts.storeType;

    this.dbName = opts.dbName;
    this.tableName = opts.tableName;

    this.clearExpiredByTimeout = opts.clearExpiredByTimeout;

    this.tableCreated = opts.tableCreated;
    if (!this.tableCreated) {
      this._createDbAndTable()
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
      if (this.clearExpiredByTimeout) {
        this._clearExpiredHourAgo();
      }
      if (typeof cb === 'function') {
        cb();
      }
    }
  }

  clearExpired(expire) {
    return new Promise((resolve) => {
      this._getConnection()
        .then((conn) => {
          conn.query(`DELETE FROM ??.?? WHERE expire < ?`, [this.dbName, this.tableName, expire], () => {
            this._releaseConnection(conn);
            resolve();
          });
        })
        .catch(() => {
          resolve();
        });
    });
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

  /**
   *
   * @return Promise<any>
   * @private
   */
  _getConnection() {
    switch (this.clientType) {
      case 'pool':
        return new Promise((resolve, reject) => {
          this.client.getConnection((errConn, conn) => {
            if (errConn) {
              return reject(errConn);
            }

            resolve(conn);
          });
        });
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
        return conn.release();
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
  _createDbAndTable() {
    return new Promise((resolve, reject) => {
      this._getConnection()
        .then((conn) => {
          conn.query(`CREATE DATABASE IF NOT EXISTS \`${this.dbName}\`;`, (errDb) => {
            if (errDb) {
              this._releaseConnection(conn);
              return reject(errDb);
            }
            conn.query(this._getCreateTableStmt(), (err) => {
              if (err) {
                this._releaseConnection(conn);
                return reject(err);
              }
              this._releaseConnection(conn);
              resolve();
            });
          });
        })
        .catch((err) => {
          reject(err);
        });
    });
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS \`${this.dbName}\`.\`${this.tableName}\` (` +
      '`key` VARCHAR(255) CHARACTER SET utf8 NOT NULL,' +
      '`points` INT(9) NOT NULL default 0,' +
      '`expire` BIGINT UNSIGNED,' +
      'PRIMARY KEY (`key`)' +
      ') ENGINE = INNODB;';
  }

  get clientType() {
    return this._clientType;
  }

  set clientType(value) {
    if (typeof value === 'undefined') {
      if (this.client.constructor.name === 'Connection') {
        value = 'connection';
      } else if (this.client.constructor.name === 'Pool') {
        value = 'pool';
      } else if (this.client.constructor.name === 'Sequelize') {
        value = 'sequelize';
      } else {
        throw new Error('storeType is not defined');
      }
    }
    this._clientType = value.toLowerCase();
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
    const [row] = result;

    res.isFirstInDuration = changedPoints === row.points;
    res.consumedPoints = res.isFirstInDuration ? changedPoints : row.points;

    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = row.expire
      ? Math.max(row.expire - Date.now(), 0)
      : -1;

    return res;
  }

  _upsertTransaction(conn, key, points, msDuration, forceExpire) {
    return new Promise((resolve, reject) => {
      conn.query('BEGIN', (errBegin) => {
        if (errBegin) {
          conn.rollback();

          return reject(errBegin);
        }

        const dateNow = Date.now();
        const newExpire = msDuration > 0 ? dateNow + msDuration : null;

        let q;
        let values;
        if (forceExpire) {
          q = `INSERT INTO ??.?? VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            points = ?, 
            expire = ?;`;
          values = [
            this.dbName, this.tableName, key, points, newExpire,
            points,
            newExpire,
          ];
        } else {
          q = `INSERT INTO ??.?? VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            points = IF(expire <= ?, ?, points + (?)), 
            expire = IF(expire <= ?, ?, expire);`;
          values = [
            this.dbName, this.tableName, key, points, newExpire,
            dateNow, points, points,
            dateNow, newExpire,
          ];
        }

        conn.query(q, values, (errUpsert) => {
          if (errUpsert) {
            conn.rollback();

            return reject(errUpsert);
          }
          conn.query('SELECT points, expire FROM ??.?? WHERE `key` = ?;', [this.dbName, this.tableName, key], (errSelect, res) => {
            if (errSelect) {
              conn.rollback();

              return reject(errSelect);
            }

            conn.query('COMMIT', (err) => {
              if (err) {
                conn.rollback();

                return reject(err);
              }

              resolve(res);
            });
          });
        });
      });
    });
  }

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      this._getConnection()
        .then((conn) => {
          this._upsertTransaction(conn, key, points, msDuration, forceExpire)
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

  _get(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(Error('Table is not created yet'));
    }

    return new Promise((resolve, reject) => {
      this._getConnection()
        .then((conn) => {
          conn.query(
            'SELECT points, expire FROM ??.?? WHERE `key` = ? AND (`expire` > ? OR `expire` IS NULL)',
            [this.dbName, this.tableName, rlKey, Date.now()],
            (err, res) => {
              if (err) {
                reject(err);
              } else if (res.length === 0) {
                resolve(null);
              } else {
                resolve(res);
              }

              this._releaseConnection(conn);
            } // eslint-disable-line
          );
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

    return new Promise((resolve, reject) => {
      this._getConnection()
        .then((conn) => {
          conn.query(
            'DELETE FROM ??.?? WHERE `key` = ?',
            [this.dbName, this.tableName, rlKey],
            (err, res) => {
              if (err) {
                reject(err);
              } else {
                resolve(res.affectedRows > 0);
              }

              this._releaseConnection(conn);
            } // eslint-disable-line
          );
        })
        .catch((err) => {
          reject(err);
        });
    });
  }
}

module.exports = RateLimiterMySQL;
