const RateLimiterStoreAbstract = require("./RateLimiterStoreAbstract");
const RateLimiterRes = require("./RateLimiterRes");

class RateLimiterSQLite extends RateLimiterStoreAbstract {
  /**
   * Internal store type used to determine the SQLite client in use.
   * It can be one of the following:
   * - `"sqlite3".
   * - `"better-sqlite3".
   *
   * @type {("sqlite3" | "better-sqlite3" | null)}
   * @private
   */
  _internalStoreType = null;

  /**
   * @callback callback
   * @param {Object} err
   *
   * @param {Object} opts
   * @param {callback} cb
   * Defaults {
   *   ... see other in RateLimiterStoreAbstract
   *   storeClient: sqliteClient, // SQLite database instance (sqlite3, better-sqlite3, or knex instance)
   *   storeType: 'sqlite3' | 'better-sqlite3' | 'knex', // Optional, defaults to 'sqlite3'
   *   tableName: 'string',
   *   tableCreated: boolean,
   *   clearExpiredByTimeout: boolean,
   * }
   */
  constructor(opts, cb = null) {
    super(opts);

    this.client = opts.storeClient;
    this.storeType = opts.storeType || "sqlite3";
    this.tableName = opts.tableName;
    this.tableCreated = opts.tableCreated || false;
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout;

    this._validateStoreTypes(cb);
    this._validateStoreClient(cb);
    this._setInternalStoreType(cb);
    this._validateTableName(cb);

    if (!this.tableCreated) {
      this._createDbAndTable()
        .then(() => {
          this.tableCreated = true;
          if (this.clearExpiredByTimeout) this._clearExpiredHourAgo();
          if (typeof cb === "function") cb();
        })
        .catch((err) => {
          if (typeof cb === "function") cb(err);
          else throw err;
        });
    } else {
      if (this.clearExpiredByTimeout) this._clearExpiredHourAgo();
      if (typeof cb === "function") cb();
    }
  }
  _validateStoreTypes(cb) {
    const validStoreTypes = ["sqlite3", "better-sqlite3", "knex"];
    if (!validStoreTypes.includes(this.storeType)) {
      const err = new Error(
        `storeType must be one of: ${validStoreTypes.join(", ")}`
      );
      if (typeof cb === "function") return cb(err);
      throw err;
    }
  }
  _validateStoreClient(cb) {
    if (this.storeType === "sqlite3") {
      if (typeof this.client.run !== "function") {
        const err = new Error(
          "storeClient must be an instance of sqlite3.Database when storeType is 'sqlite3' or no storeType was provided"
        );
        if (typeof cb === "function") return cb(err);
        throw err;
      }
    } else if (this.storeType === "better-sqlite3") {
      if (
        typeof this.client.prepare !== "function" ||
        typeof this.client.run !== "undefined"
      ) {
        const err = new Error(
          "storeClient must be an instance of better-sqlite3.Database when storeType is 'better-sqlite3'"
        );
        if (typeof cb === "function") return cb(err);
        throw err;
      }
    } else if (this.storeType === "knex") {
      if (typeof this.client.raw !== "function") {
        const err = new Error(
          "storeClient must be an instance of Knex when storeType is 'knex'"
        );
        if (typeof cb === "function") return cb(err);
        throw err;
      }
    }
  }
  _setInternalStoreType(cb) {
    if (this.storeType === "knex") {
      const knexClientType = this.client.client.config.client;
      if (knexClientType === "sqlite3") {
        this._internalStoreType = "sqlite3";
      } else if (knexClientType === "better-sqlite3") {
        this._internalStoreType = "better-sqlite3";
      } else {
        const err = new Error(
          "Knex must be configured with 'sqlite3' or 'better-sqlite3' for RateLimiterSQLite"
        );
        if (typeof cb === "function") return cb(err);
        throw err;
      }
    } else {
      this._internalStoreType = this.storeType;
    }
  }
  _validateTableName(cb) {
    if (!/^[A-Za-z0-9_]*$/.test(this.tableName)) {
      const err = new Error("Table name must contain only letters and numbers");
      if (typeof cb === "function") return cb(err);
      throw err;
    }
  }

  /**
   * Acquires the database connection based on the storeType.
   * @returns {Promise<Object>} The database client or connection
   */
  async _getConnection() {
    if (this.storeType === "knex") {
      return this.client.client.acquireConnection(); // Acquire raw connection from knex pool
    }
    return this.client; // For sqlite3 and better-sqlite3, return the client directly
  }

  /**
   * Releases the database connection if necessary.
   * @param {Object} conn The database client or connection
   */
  _releaseConnection(conn) {
    if (this.storeType === "knex") {
      this.client.client.releaseConnection(conn);
    }
    // No release needed for direct sqlite3 or better-sqlite3 clients
  }

  async _createDbAndTable() {
    const conn = await this._getConnection();
    try {
      switch (this._internalStoreType) {
        case "sqlite3":
          await new Promise((resolve, reject) => {
            conn.run(this._getCreateTableSQL(), (err) =>
              err ? reject(err) : resolve()
            );
          });
          break;
        case "better-sqlite3":
          conn.prepare(this._getCreateTableSQL()).run();
          break;
        default:
          throw new Error("Unsupported internalStoreType");
      }
    } finally {
      this._releaseConnection(conn);
    }
  }

  _getCreateTableSQL() {
    return `CREATE TABLE IF NOT EXISTS ${this.tableName} (
      key TEXT PRIMARY KEY,
      points INTEGER NOT NULL DEFAULT 0,
      expire INTEGER
    )`;
  }

  _clearExpiredHourAgo() {
    if (this._clearExpiredTimeoutId) clearTimeout(this._clearExpiredTimeoutId);
    this._clearExpiredTimeoutId = setTimeout(() => {
      this.clearExpired(Date.now() - 3600000) // 1 hour ago
        .then(() => this._clearExpiredHourAgo());
    }, 300000); // Every 5 minutes
    this._clearExpiredTimeoutId.unref();
  }

  async clearExpired(nowMs) {
    const sql = `DELETE FROM ${this.tableName} WHERE expire < ?`;
    const conn = await this._getConnection();
    try {
      switch (this._internalStoreType) {
        case "sqlite3":
          await new Promise((resolve, reject) => {
            conn.run(sql, [nowMs], (err) => (err ? reject(err) : resolve()));
          });
          break;
        case "better-sqlite3":
          conn.prepare(sql).run(nowMs);
          break;
        default:
          throw new Error("Unsupported internalStoreType");
      }
    } finally {
      this._releaseConnection(conn);
    }
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

  async _upsertTransactionSQLite3(conn, upsertQuery, upsertParams) {
    return await new Promise((resolve, reject) => {
      conn.serialize(() => {
        conn.run("SAVEPOINT rate_limiter_trx;", (err) => {
          if (err) return reject(err);
          conn.get(upsertQuery, upsertParams, (err, row) => {
            if (err) {
              conn.run("ROLLBACK TO SAVEPOINT rate_limiter_trx;", () =>
                reject(err)
              );
              return;
            }
            conn.run("RELEASE SAVEPOINT rate_limiter_trx;", () => resolve(row));
          });
        });
      });
    });
  }

  async _upsertTransactionBetterSQLite3(conn, upsertQuery, upsertParams) {
    return conn.transaction(() =>
      conn.prepare(upsertQuery).get(...upsertParams)
    )();
  }
  async _upsertTransaction(rlKey, points, msDuration, forceExpire) {
    const dateNow = Date.now();
    const newExpire = msDuration > 0 ? dateNow + msDuration : null;
    const upsertQuery = forceExpire
      ? `INSERT OR REPLACE INTO ${this.tableName} (key, points, expire) VALUES (?, ?, ?) RETURNING points, expire`
      : `INSERT INTO ${this.tableName} (key, points, expire)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           points = CASE WHEN expire IS NULL OR expire > ? THEN points + excluded.points ELSE excluded.points END,
           expire = CASE WHEN expire IS NULL OR expire > ? THEN expire ELSE excluded.expire END
         RETURNING points, expire`;
    const upsertParams = forceExpire
      ? [rlKey, points, newExpire]
      : [rlKey, points, newExpire, dateNow, dateNow];

    const conn = await this._getConnection();
    try {
      switch (this._internalStoreType) {
        case "sqlite3":
          return this._upsertTransactionSQLite3(
            conn,
            upsertQuery,
            upsertParams
          );
        case "better-sqlite3":
          return this._upsertTransactionBetterSQLite3(
            conn,
            upsertQuery,
            upsertParams
          );
        default:
          throw new Error("Unsupported internalStoreType");
      }
    } finally {
      this._releaseConnection(conn);
    }
  }

  _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (!this.tableCreated) {
      return Promise.reject(new Error("Table is not created yet"));
    }
    return this._upsertTransaction(rlKey, points, msDuration, forceExpire);
  }

  async _get(rlKey) {
    const sql = `SELECT points, expire FROM ${this.tableName} WHERE key = ? AND (expire > ? OR expire IS NULL)`;
    const now = Date.now();
    const conn = await this._getConnection();
    try {
      switch (this._internalStoreType) {
        case "sqlite3":
          return await new Promise((resolve, reject) => {
            conn.get(sql, [rlKey, now], (err, row) =>
              err ? reject(err) : resolve(row || null)
            );
          });
        case "better-sqlite3":
          return conn.prepare(sql).get(rlKey, now) || null;
        default:
          throw new Error("Unsupported internalStoreType");
      }
    } finally {
      this._releaseConnection(conn);
    }
  }

  async _delete(rlKey) {
    if (!this.tableCreated) {
      return Promise.reject(new Error("Table is not created yet"));
    }
    const sql = `DELETE FROM ${this.tableName} WHERE key = ?`;
    const conn = await this._getConnection();
    try {
      switch (this._internalStoreType) {
        case "sqlite3":
          return await new Promise((resolve, reject) => {
            conn.run(sql, [rlKey], function (err) {
              if (err) reject(err);
              else resolve(this.changes > 0);
            });
          });
        case "better-sqlite3":
          const result = conn.prepare(sql).run(rlKey);
          return result.changes > 0;
        default:
          throw new Error("Unsupported internalStoreType");
      }
    } finally {
      this._releaseConnection(conn);
    }
  }
}

module.exports = RateLimiterSQLite;
