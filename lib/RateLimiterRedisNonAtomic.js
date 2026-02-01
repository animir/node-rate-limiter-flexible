const RateLimiterStoreAbstract = require('./RateLimiterStoreAbstract');
const RateLimiterRes = require('./RateLimiterRes');

class RateLimiterRedisNonAtomic extends RateLimiterStoreAbstract {
  constructor(opts) {
    super(opts);
    this.client = opts.storeClient;
    this._rejectIfRedisNotReady = !!opts.rejectIfRedisNotReady;
    this.useRedisPackage = opts.useRedisPackage || this.client.constructor.name === 'Commander' || false;
  }

  _isRedisReady(rlKey, isReadonly) {
    if (!this._rejectIfRedisNotReady) {
      return true;
    }
    // ioredis client
    if (this.client.status) {
      return this.client.status === 'ready';
    }
    // node-redis v3 client
    if (typeof this.client.isReady === 'function') {
      return this.client.isReady();
    }

    // node-redis v4+ (non-cluster) client
    if (typeof this.client.isReady === 'boolean') {
      return this.client.isReady === true;
    }

    // node-redis v4+ cluster client
    if (this.client._slots && typeof this.client._slots.getClient === 'function') {
      if (typeof this.client.isOpen === 'boolean' && this.client.isOpen !== true) {
        return false;
      }

      try {
        const slotClient = this.client._slots.getClient(rlKey, isReadonly);
        return slotClient && slotClient.isReady === true;
      } catch (error) {
        return false;
      }
    }
    return true;
  }

  _getRateLimiterRes(rlKey, changedPoints, result) {
    let [consumed, resTtlMs] = result;
    // Support ioredis results format
    if (Array.isArray(consumed)) {
      [, consumed] = consumed;
      [, resTtlMs] = resTtlMs;
    }

    const res = new RateLimiterRes();
    res.consumedPoints = parseInt(consumed);
    res.isFirstInDuration = res.consumedPoints === changedPoints;
    res.remainingPoints = Math.max(this.points - res.consumedPoints, 0);
    res.msBeforeNext = resTtlMs;

    return res;
  }

  _parseStoreResult(result) {
    let points;
    let ttlMs;

    if (Array.isArray(result[0])) {
      [, points] = result[0];
      [, ttlMs] = result[1];
    } else {
      [points, ttlMs] = result;
    }

    return {
      points: parseInt(points, 10),
      ttlMs,
    };
  }

  _execMulti(multi) {
    return multi.exec();
  }

  _setKey(rlKey, points, secDuration) {
    const multi = this.client.multi();
    if (secDuration > 0) {
      if (!this.useRedisPackage) {
        multi.set(rlKey, points, 'EX', secDuration);
      } else {
        multi.set(rlKey, points, { EX: secDuration });
      }
    } else {
      multi.set(rlKey, points);
    }
    return this._execMulti(multi);
  }

  _setKeyWithTtlMs(rlKey, points, ttlMs) {
    const multi = this.client.multi();
    multi.set(rlKey, points);

    if (ttlMs > 0) {
      if (!this.useRedisPackage) {
        multi.pexpire(rlKey, ttlMs);
      } else {
        multi.pExpire(rlKey, ttlMs);
      }
    }

    return this._execMulti(multi);
  }

  async _upsert(rlKey, points, msDuration, forceExpire = false) {
    if (
      typeof points == 'string'
    ) {
      if (!RegExp('^[1-9][0-9]*$').test(points)) {
        throw new Error('Consuming string different than integer values is not supported by this package');
      }
    } else if (!Number.isInteger(points)) {
      throw new Error('Consuming decimal number of points is not supported by this package');
    }

    if (!this._isRedisReady(rlKey, false)) {
      throw new Error('Redis connection is not ready');
    }

    const parsedPoints = typeof points === 'string' ? parseInt(points, 10) : points;
    const secDuration = Math.floor(msDuration / 1000);

    if (forceExpire) {
      await this._setKey(rlKey, parsedPoints, secDuration);
      return [parsedPoints, secDuration > 0 ? secDuration * 1000 : -1];
    }

    const currentResult = await this._get(rlKey);
    const hasCurrent = currentResult !== null;
    const current = hasCurrent ? this._parseStoreResult(currentResult) : { points: 0, ttlMs: -1 };
    const newPoints = current.points + parsedPoints;

    if (secDuration > 0) {
      if (!hasCurrent) {
        await this._setKey(rlKey, newPoints, secDuration);
        return [newPoints, secDuration * 1000];
      }

      if (current.ttlMs <= 0) {
        await this._setKey(rlKey, newPoints, secDuration);
        return [newPoints, secDuration * 1000];
      }

      await this._setKeyWithTtlMs(rlKey, newPoints, current.ttlMs);
      return [newPoints, current.ttlMs];
    }

    await this._setKey(rlKey, newPoints, 0);
    return [newPoints, -1];
  }

  async _get(rlKey) {
    if (!this._isRedisReady(rlKey, true)) {
      throw new Error('Redis connection is not ready');
    }

    const multi = this.client
      .multi()
      .get(rlKey);

    if (!this.useRedisPackage) {
      multi.pttl(rlKey);
    } else {
      multi.pTTL(rlKey);
    }

    return this._execMulti(multi).then((result) => {
      if (Array.isArray(result[0])) {
        const [, points] = result[0];
        if (points === null) return null;
        return result;
      }

      const [points] = result;
      if (points === null) return null;
      return result;
    });
  }

  _delete(rlKey) {
    return this.client
      .del(rlKey)
      .then(result => result > 0);
  }
}

module.exports = RateLimiterRedisNonAtomic;
