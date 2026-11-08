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
    this.clearExpiredByTimeout = opts.clearExpiredByTimeout ?? true;

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

    const model = this.prismaClient[this.modelName];
    const now = new Date();
    const newExpire = msDuration > 0 ? new Date(now.getTime() + msDuration) : null;
    const create = { key, points, expire: newExpire };

    if (forceExpire) {
      return model.upsert({
        where: { key },
        create,
        update: { points, expire: newExpire },
      });
    }

    // An expired row starts a new window. Any other row is incremented in the
    // database, so that concurrent calls are all counted.
    return model.deleteMany({ where: { key, expire: { lte: now } } })
      .then(() => model.upsert({
        where: { key },
        create,
        update: { points: { increment: points } },
      }));
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
      try {
        await this.prismaClient[this.modelName].deleteMany({
          where: {
            expire: {
              lt: new Date(Date.now() - 3600000),
            },
          },
        });
      } catch (error) {
        console.warn('Failed to clear expired records:', error);
      }
      this._clearExpiredHourAgo();
    }, 300000); // Clear every 5 minutes
    this._clearExpiredTimeoutId.unref();
  }
}

module.exports = RateLimiterPrisma;
