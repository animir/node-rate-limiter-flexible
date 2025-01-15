const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterPrisma extends RateLimiterStoreAbstract {
  /**
   * Constructor for the rate limiter
   * @param {Object} opts - Options for the rate limiter
   */
  constructor(opts) {
    super(opts);

    this.modelName = opts.tableName || 'RateLimiterFlexible';
    this.prismaClient = opts.storeClient;
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout || true;

    if (!this.prismaClient) {
      throw new Error('Prisma client is not provided');
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
    if (!this.prismaClient) {
      return Promise.reject(new Error('Prisma client is not established'));
    }

    const now = new Date();
    const newExpire = msDuration > 0 ? new Date(now.getTime() + msDuration) : null;

    return this.prismaClient.$transaction(async (prisma) => {
      const existingRecord = await prisma[this.modelName].findFirst({
        where: { key: key },
      });

      if (existingRecord) {
        // Determine if we should update the expire field
        const shouldUpdateExpire = forceExpire || !existingRecord.expire || existingRecord.expire <= now || newExpire === null;

        return prisma[this.modelName].update({
          where: { key: key },
          data: {
            points: !shouldUpdateExpire ? existingRecord.points + points : points,
            ...(shouldUpdateExpire && { expire: newExpire }),
          },
        });
      } else {
        return prisma[this.modelName].create({
          data: {
            key: key,
            points: points,
            expire: newExpire,
          },
        });
      }
    });
  }

  _get(rlKey) {
    if (!this.prismaClient) {
      return Promise.reject(new Error('Prisma client is not established'));
    }

    return this.prismaClient[this.modelName].findFirst({
      where: {
        AND: [
          { key: rlKey },
          {
            OR: [
              { expire: { gt: new Date() } },
              { expire: null },
            ],
          },
        ],
      },
    });
  }

  _delete(rlKey) {
    if (!this.prismaClient) {
      return Promise.reject(new Error('Prisma client is not established'));
    }

    return this.prismaClient[this.modelName].deleteMany({
      where: {
        key: rlKey,
      },
    }).then(res => res.count > 0);
  }

  _clearExpiredHourAgo() {
    if (this._clearExpiredTimeoutId) {
      clearTimeout(this._clearExpiredTimeoutId);
    }
    this._clearExpiredTimeoutId = setTimeout(async () => {
      await this.prismaClient[this.modelName].deleteMany({
        where: {
          expire: {
            lt: new Date(Date.now() - 3600000),
          },
        },
      });
      this._clearExpiredHourAgo();
    }, 300000); // Clear every 5 minutes
    this._clearExpiredTimeoutId.unref();
  }
}

module.exports = RateLimiterPrisma;
