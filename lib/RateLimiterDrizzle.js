let drizzleOperators = null;
const CLEANUP_INTERVAL_MS = 300000; // 5 minutes
const EXPIRED_THRESHOLD_MS = 3600000; // 1 hour

class RateLimiterDrizzleError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimiterDrizzleError';
  }
}

async function getDrizzleOperators() {
  if (drizzleOperators) return drizzleOperators;

  try {
    // Use dynamic import to prevent static analysis tools from detecting the import
    function getPackageName() {
      return ['drizzle', 'orm'].join('-');
    }
    const drizzleOrm = await import(`${getPackageName()}`);
    const { and, or, gt, lt, eq, isNull, sql } = drizzleOrm.default || drizzleOrm;
    drizzleOperators = { and, or, gt, lt, eq, isNull, sql };
    return drizzleOperators;
  } catch (error) {
    throw new RateLimiterDrizzleError(
      'drizzle-orm is not installed. Please install drizzle-orm to use RateLimiterDrizzle.'
    );
  }
}

const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterDrizzle extends RateLimiterStoreAbstract {
  constructor(opts) {
    super(opts);

    if (!opts?.schema) {
      throw new RateLimiterDrizzleError('Drizzle schema is required');
    }

    if (!opts?.storeClient) {
      throw new RateLimiterDrizzleError('Drizzle client is required');
    }

    this.schema = opts.schema;
    this.drizzleClient = opts.storeClient;
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout ?? true;

    if (this.clearExpiredByTimeout) {
      this._clearExpiredHourAgo();
    }
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    const res = new RateLimiterRes();

    let doc = result;
    res.isFirstInDuration = doc.points === changedPoints;
    res.consumedPoints = doc.points;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = doc.expire !== null
      ? Math.max(new Date(doc.expire).getTime() - Date.now(), 0)
      : -1;

    return res;
  }

  async _upsert(key, points, msDuration, forceExpire = false) {
    if (!this.drizzleClient) {
      return Promise.reject(new RateLimiterDrizzleError('Drizzle client is not established'))
    }

    const { eq, sql } = await getDrizzleOperators();
    const now = new Date();
    const newExpire = msDuration > 0 ? new Date(now.getTime() + msDuration) : null;

    const query = await this.drizzleClient.transaction(async (tx) => {
      const [existingRecord] = await tx
        .select()
        .from(this.schema)
        .where(eq(this.schema.key, key))
        .limit(1);

      const shouldUpdateExpire =
        forceExpire ||
        !existingRecord?.expire ||
        existingRecord?.expire <= now ||
        newExpire === null;

      const [data] = await tx
        .insert(this.schema)
        .values({
          key,
          points,
          expire: newExpire,
        })
        .onConflictDoUpdate({
          target: this.schema.key,
          set: {
            points: !shouldUpdateExpire
              ? sql`${this.schema.points} + ${points}`
              : points,
            ...(shouldUpdateExpire && { expire: newExpire }),
          },
        })
        .returning();

      return data;
    })

    return query
  }

  async _get(rlKey) {
    if (!this.drizzleClient) {
      return Promise.reject(new RateLimiterDrizzleError('Drizzle client is not established'))
    }

    const { and, or, gt, eq, isNull } = await getDrizzleOperators();

    const [response] = await this.drizzleClient
      .select()
      .from(this.schema)
      .where(
        and(
          eq(this.schema.key, rlKey),
          or(gt(this.schema.expire, new Date()), isNull(this.schema.expire))
        )
      )
      .limit(1);

    return response || null;

  }

  async _delete(rlKey) {
    if (!this.drizzleClient) {
      return Promise.reject(new RateLimiterDrizzleError('Drizzle client is not established'))
    }

    const { eq } = await getDrizzleOperators();

    const [result] = await this.drizzleClient
      .delete(this.schema)
      .where(eq(this.schema.key, rlKey))
      .returning({ key: this.schema.key });

    return !!result?.key
  }

  _clearExpiredHourAgo() {
    if (this._clearExpiredTimeoutId) {
      clearTimeout(this._clearExpiredTimeoutId);
    }

    this._clearExpiredTimeoutId = setTimeout(async () => {
      try {
        const { lt } = await getDrizzleOperators();
        await this.drizzleClient
          .delete(this.schema)
          .where(lt(this.schema.expire, new Date(Date.now() - EXPIRED_THRESHOLD_MS)));
      } catch (error) {
        console.warn('Failed to clear expired records:', error);
      }

      this._clearExpiredHourAgo();
    }, CLEANUP_INTERVAL_MS);

    this._clearExpiredTimeoutId.unref();
  }
}

module.exports = RateLimiterDrizzle;
