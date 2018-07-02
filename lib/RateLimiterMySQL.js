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
    this.client.query(`CREATE DATABASE IF NOT EXISTS ${this.dbName};${this._getCreateTableStmt()}`, (err) => {
      if (err) {
        throw err;
      } else {
        this._tableCreated = true;
        this._clearExpiredHourAgo();
      }
    });
  }

  _clearExpiredHourAgo() {
    this._clearExpiredTimeoutId = setTimeout(() => {
      const expire = new Date(Date.now() - 3600000);
      this.client.query(`DELETE FROM ${this.tableName} WHERE expire < ?`, [expire], () => {
        this._clearExpiredHourAgo();
      });
    }, 300000);
    this._clearExpiredTimeoutId.unref();
  }

  _getCreateTableStmt() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} (` +
      '`key` varchar(255) NOT NULL,' +
      '`points` int(9) NOT NULL default 0,' +
      '`expire` datetime NOT NULL,' +
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
    let row;
    if (result.length === 1) {
      [row] = result;
    } else {
      const [, , rows] = result;
      [row] = rows;
    }

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

    return new Promise((resolve, reject) => {
      const dateNow = new Date();
      const newExpire = new Date(Date.now() + msDuration);
      const expireQ = forceExpire
        ? ' @expire '
        : ' IF(expire < @now, @expire, expire) ';
      const q = `
    SET @changedPoints = ?, @expire = ?, @now = ?;
    INSERT INTO ?? VALUES (?, @changedPoints, @expire)
      ON DUPLICATE KEY UPDATE 
        points = @changedPoints := IF(expire < @now, @changedPoints, points + (@changedPoints)), 
        expire = @expire := ${expireQ};
    SELECT @changedPoints points, @expire expire;`;

      this.client.query(
        q,
        [
          points, newExpire, dateNow,
          this.tableName, key,
        ],
        (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        } // eslint-disable-line
      );
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
        [this.tableName, rlKey, new Date()],
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
