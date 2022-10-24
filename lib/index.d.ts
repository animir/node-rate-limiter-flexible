export interface IRateLimiterRes {
    msBeforeNext?: number;
    remainingPoints?: number;
    consumedPoints?: number;
    isFirstInDuration?: boolean;
}

export class RateLimiterRes {
    constructor(
        remainingPoints?: number,
        msBeforeNext?: number,
        consumedPoints?: number,
        isFirstInDuration?: boolean
    );

    readonly msBeforeNext: number;
    readonly remainingPoints: number;
    readonly consumedPoints: number;
    readonly isFirstInDuration: boolean;

    toString(): string;
    toJSON(): {
        remainingPoints: number;
        msBeforeNext: number;
        consumedPoints: number;
        isFirstInDuration: boolean;
    };
}

export class RateLimiterAbstract {
    constructor(opts: IRateLimiterOptions);

    /**
     * Maximum number of points can be consumed over duration. Limiter compares this number with
     * number of consumed points by key to decide if an operation should be rejected or resolved.
     */
    points: number;

    /**
     * Number of seconds before consumed points are reset.
     * Keys never expire, if duration is 0.
     */
    duration: number;

    /**
     * duration in milliseconds
     */
    get msDuration(): number;

    /**
     * If positive number and consumed more than points in current duration, block for blockDuration
     * seconds.
     */
    blockDuration: number;

    /**
     * blockDuration in milliseconds
     */
    get msBlockDuration(): number;

    /**
     * Delay action to be executed evenly over duration First action in duration is executed without
     * delay. All next allowed actions in current duration are delayed by formula
     * msBeforeDurationEnd / (remainingPoints + 2) with minimum delay of duration * 1000 / points.
     * It allows to cut off load peaks similar way to Leaky Bucket.
     *
     * Note: it isn't recommended to use it for long duration and few points, as it may delay action
     * for too long with default execEvenlyMinDelayMs.
     */
    execEvenly: boolean;

    /**
     * Sets minimum delay in milliseconds, when action is delayed with execEvenly
     */
    execEvenlyMinDelayMs: number;

    /**
     * If you need to create several limiters for different purpose.
     * Set to empty string '', if keys should be stored without prefix.
     */
    keyPrefix: string;

    /**
     * Returns internal key prefixed with keyPrefix option as it is saved in store.
     */
    getKey(key: string | number): string;

    /**
     * Returns internal key without the keyPrefix.
     */
    parseKey(rlKey: string): string;

    /**
     * @param key is usually IP address or some unique client id
     * @param pointsToConsume number of points consumed. default: 1
     * @param options is object with additional settings:
     * - customDuration expire in seconds for this operation only overwrites limiter's duration. It doesn't work, if key already created.
     * @returns Returns Promise, which:
     * - `resolved` with `RateLimiterRes` when point(s) is consumed, so action can be done
     * - `rejected` only for store and database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     * - `rejected` when there is no points to be consumed, where reject reason `rejRes` is `RateLimiterRes` object
     * - `rejected` when key is blocked (if block strategy is set up), where reject reason `rejRes` is `RateLimiterRes` object
     */
    consume(
        key: string | number,
        pointsToConsume?: number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes>;

    /**
     * Fine key by points number of points for one duration.
     *
     * Note: Depending on time penalty may go to next durations
     *
     * @returns Returns Promise, which:
     * - `resolved` with RateLimiterRes
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    penalty(
        key: string | number,
        points?: number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes>;

    /**
     * Reward key by points number of points for one duration.
     * Note: Depending on time reward may go to next durations
     * @returns Promise, which:
     * - `resolved` with RateLimiterRes
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    reward(
        key: string | number,
        points?: number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes>;

    /**
     * Get RateLimiterRes in current duration. It always returns RateLimiterRes.isFirstInDuration=false.
     * @param key is usually IP address or some unique client id
     * @param options
     * @returns  Promise, which:
     * - `resolved` with RateLimiterRes if key is set
     * - `resolved` with null if key is NOT set or expired
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    get(
        key: string | number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes | null>;

    /**
     * Set points to key for secDuration seconds.
     * Store it forever, if secDuration is 0.
     * @param key
     * @param points
     * @param secDuration
     * @param options
     * @returns Promise, which:
     * - `resolved` with RateLimiterRes
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    set(
        key: string | number,
        points: number,
        secDuration: number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes>;

    /**
     * Block key by setting consumed points to points + 1 for secDuration seconds.
     *
     * It force updates expire, if there is already key.
     *
     * Blocked key never expires, if secDuration is 0.
     * @returns Promise, which:
     * - `resolved` with RateLimiterRes
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    block(
        key: string | number,
        secDuration: number,
        options?: { [key: string]: any }
    ): Promise<RateLimiterRes>;

    /**
     * Delete all data related to key.
     *
     * For example, previously blocked key is not blocked after delete as there is no data anymore.
     * @returns Promise, which:
     * - `resolved` with boolean, true if data is removed by key, false if there is no such key.
     * - `rejected` only for database limiters if insuranceLimiter isn't setup: when some error happened, where reject reason `rejRes` is Error object
     * - `rejected` only for RateLimiterCluster if insuranceLimiter isn't setup: when timeoutMs exceeded, where reject reason `rejRes` is Error object
     */
    delete(
        key: string | number,
        options?: { [key: string]: any }
    ): Promise<boolean>;
}

export class RateLimiterStoreAbstract extends RateLimiterAbstract {
    constructor(opts: IRateLimiterStoreOptions);

    /**
     * Cleanup keys blocked in current process memory
     */
    deleteInMemoryBlockedAll(): void;
}

interface IRateLimiterOptions {
    keyPrefix?: string;
    points?: number;
    duration?: number;
    execEvenly?: boolean;
    execEvenlyMinDelayMs?: number;
    blockDuration?: number;
}

interface IRateLimiterClusterOptions extends IRateLimiterOptions {
    timeoutMs?: number;
}

interface IRateLimiterStoreOptions extends IRateLimiterOptions {
    storeClient: any;
    storeType?: string;
    inMemoryBlockOnConsumed?: number;
    inMemoryBlockDuration?: number;
    /**
    * @deprecated Use camelCased inMemoryBlockOnConsumed option
    */
    inmemoryBlockOnConsumed?: number;
    /**
    * @deprecated Use camelCased inMemoryBlockOnConsumed option
    */
    inmemoryBlockDuration?: number;
    insuranceLimiter?: RateLimiterAbstract;
    dbName?: string;
    tableName?: string;
    tableCreated?: boolean;
}

interface IRateLimiterStoreNoAutoExpiryOptions extends IRateLimiterStoreOptions {
    clearExpiredByTimeout?: boolean;
}

interface IRateLimiterMongoOptions extends IRateLimiterStoreOptions {
    indexKeyPrefix?: {
        [key: string]: any;
    };
}

interface IRateLimiterRedisOptions extends IRateLimiterStoreOptions {
  rejectIfRedisNotReady?: boolean;
}

interface ICallbackReady {
    (error?: Error): void;
}

interface IRLWrapperBlackAndWhiteOptions {
    limiter: RateLimiterAbstract;
    blackList?: string[] | number[];
    whiteList?: string[] | number[];
    isBlackListed?(key: any): boolean;
    isWhiteListed?(key: any): boolean;
    runActionAnyway?: boolean;
}

export class RateLimiterMemory extends RateLimiterAbstract {
    constructor(opts: IRateLimiterOptions);
}

export class RateLimiterCluster extends RateLimiterAbstract {
    constructor(opts: IRateLimiterClusterOptions);
}

export class RateLimiterClusterMaster {
    constructor();
}

export class RateLimiterClusterMasterPM2 {
    constructor(pm2: any);
}

export class RateLimiterRedis extends RateLimiterStoreAbstract {
  constructor(opts: IRateLimiterRedisOptions);
}

export interface IRateLimiterMongoFunctionOptions {
    attrs: { [key: string]: any };
}

export class RateLimiterMongo extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterMongoOptions);
    indexKeyPrefix(): Object;
    indexKeyPrefix(obj?: Object): void;

    consume(
        key: string | number,
        pointsToConsume?: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;

    penalty(
        key: string | number,
        points?: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;

    reward(
        key: string | number,
        points?: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;

    block(
        key: string | number,
        secDuration: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;

    get(
        key: string | number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes | null>;

    set(
        key: string | number,
        points: number,
        secDuration: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;

    delete(
        key: string | number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<boolean>;
}

export class RateLimiterMySQL extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreNoAutoExpiryOptions, cb?: ICallbackReady);
}

export class RateLimiterPostgres extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreNoAutoExpiryOptions, cb?: ICallbackReady);
}

export class RateLimiterMemcache extends RateLimiterStoreAbstract {}

export class RateLimiterUnion {
    constructor(...limiters: RateLimiterAbstract[]);

    consume(key: string | number, points?: number): Promise<RateLimiterRes[]>;
}

export class RLWrapperBlackAndWhite extends RateLimiterAbstract {
    constructor(opts: IRLWrapperBlackAndWhiteOptions);
}

interface IRateLimiterQueueOpts {
    maxQueueSize?: number;
}

export class RateLimiterQueue {
    constructor(
        limiterFlexible: RateLimiterAbstract | BurstyRateLimiter,
        opts?: IRateLimiterQueueOpts
    );

    getTokensRemaining(key?: string | number): Promise<number>;

    removeTokens(tokens: number, key?: string | number): Promise<number>;
}

export class BurstyRateLimiter {
    constructor(
        rateLimiter: RateLimiterAbstract,
        burstLimiter: RateLimiterAbstract
    );

    consume(
        key: string | number,
        pointsToConsume?: number,
        options?: IRateLimiterMongoFunctionOptions
    ): Promise<RateLimiterRes>;
}
