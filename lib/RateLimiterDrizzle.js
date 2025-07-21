// lib imports here 
const { and, or, gt, lt, eq, isNull } = require('drizzle-orm');

const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');


class RateLimiterDrizzle extends RateLimiterStoreAbstract {
  /**
   * Constructor for the rate limiter
   * @param {Object} opts - Options for the rate limiter
   */
  constructor(opts) {
    super(opts);

    this.schema = opts.schema

    if(!this.schema) {
        throw new Error('Drizzle schema not provided')
    }

    this.drizzleClient = opts.storeClient;
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout || true;

    if (!this.drizzleClient) {
      throw new Error('Drizzle client is not provided');
    }

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

  _upsert(key, points, msDuration, forceExpire = false) {
    if (!this.drizzleClient) {
      return Promise.reject(new Error('Drizzle client is not established'));
    }

    const now = new Date();
    const newExpire = msDuration > 0 ? new Date(now.getTime() + msDuration) : null;

    return this.drizzleClient.transaction(async (tx) => {
      const [existingRecord]  = await tx.select().from(this.schema).where(eq(this.schema.key , key)).limit(1)

      if (existingRecord) {
        // Determine if we should update the expire field
        const shouldUpdateExpire = forceExpire || !existingRecord.expire || existingRecord.expire <= now || newExpire === null;

        const [result] = await tx.update(this.schema).set({
         points: !shouldUpdateExpire ? existingRecord.points + points : points,
         ...(shouldUpdateExpire && { expire: newExpire }),
        }).where(eq(this.schema.key , key)).returning()

        return result
      } else {
        const [data] = await tx.insert(this.schema).values({
            key: key,
            points: points,
            expire: newExpire,
          }).returning()
          
        return data
      }
    });
  }

  async _get(rlKey) {
    if (!this.drizzleClient) {
      return Promise.reject(new Error('Drizzle client is not established'));
    }

    const [response] = await this.drizzleClient
    .select()
    .from(this.schema)
    .where(
      and(
        eq(this.schema.key, rlKey),
        or(
          gt(this.schema.expire, new Date()),
          isNull(this.schema.expire)
        )
      )
    )
    .limit(1);
    
    return response
  }

  async _delete(rlKey) {
    if (!this.drizzleClient) {
      return Promise.reject(new Error('Drizzle client is not established'));
    }

    const [result] = await this.drizzleClient
    .delete(this.schema)
    .where(eq(this.schema.key, rlKey))
    .returning({ key: this.schema.key });

    return(result.key.length  > 0)
  }

  _clearExpiredHourAgo() {
    if (this._clearExpiredTimeoutId) {
      clearTimeout(this._clearExpiredTimeoutId);
    }
    this._clearExpiredTimeoutId = setTimeout(async () => {
      await this.drizzleClient.delete(this.schema).where(
          lt(this.schema.expire, new Date(Date.now() - 3600000))
      )
      this._clearExpiredHourAgo();
    }, 300000); // Clear every 5 minutes
    this._clearExpiredTimeoutId.unref();
  }
}

module.exports = RateLimiterDrizzle;
