export interface IRateLimiterRes {
    msBeforeNext?: number;
    remainingPoints?: number;
    consumedPoints?: number;
    isFirstInDuration?: boolean;
}

export class RateLimiterRes {
    constructor(remainingPoints?: number, msBeforeNext?: number, consumedPoints?: number, isFirstInDuration?: boolean);

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

    consume(key: string | number, pointsToConsume?: number, options?: {[key: string]: any }): Promise<RateLimiterRes>;

    penalty(key: string | number, points?: number, options?: {[key: string]: any }): Promise<RateLimiterRes>;

    reward(key: string | number, points?: number, options?: {[key: string]: any }): Promise<RateLimiterRes>;

    block(key: string | number, secDuration: number, options?: {[key: string]: any }): Promise<RateLimiterRes>;

    get(key: string | number, options?: {[key: string]: any }): Promise<RateLimiterRes|null>;

    set(key: string | number, points: number, secDuration: number, options?: {[key: string]: any }): Promise<RateLimiterRes>;

    delete(key: string | number, options?: {[key: string]: any }): Promise<boolean>;

    getKey(key: string | number): string;
}

export class RateLimiterStoreAbstract extends RateLimiterAbstract {
    constructor(opts: IRateLimiterStoreOptions);
}

interface IRateLimiterOptions {
    keyPrefix?: string;
    points?: number;
    duration?: number;
    execEvenly?: boolean;
    execEvenlyMinDelayMs?: number;
    blockDuration?: number;
}

interface IRateLimiterClusterOptions extends IRateLimiterOptions{
    timeoutMs?: number;
}

interface IRateLimiterStoreOptions extends IRateLimiterOptions{
    storeClient: any;
    storeType?: string;
    inmemoryBlockOnConsumed?: number;
    inmemoryBlockDuration?: number;
    insuranceLimiter?: RateLimiterAbstract;
    dbName?: string;
    tableName?: string;
    tableCreated?: boolean;
}

interface IRateLimiterMongoOptions extends IRateLimiterStoreOptions{
    indexKeyPrefix?: {
        [key: string]: any
    };
}

interface ICallbackReady {
    (error?: Error): void;
}

interface IRLWrapperBlackAndWhiteOptions {
    limiter: RateLimiterAbstract;
    blackList?: string [] | number[];
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
}

export interface IRateLimiterMongoFunctionOptions {
    attrs: {[key: string]: any};
}

export class RateLimiterMongo extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterMongoOptions);
    indexKeyPrefix():Object;
    indexKeyPrefix(obj?: Object):void;

    consume(key: string | number, pointsToConsume?: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;

    penalty(key: string | number, points?: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;

    reward(key: string | number, points?: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;

    block(key: string | number, secDuration: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;

    get(key: string | number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes|null>;

    set(key: string | number, points: number, secDuration: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;

    delete(key: string | number, options?: IRateLimiterMongoFunctionOptions): Promise<boolean>;
}

export class RateLimiterMySQL extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreOptions, cb?: ICallbackReady);
}

export class RateLimiterPostgres extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreOptions, cb?: ICallbackReady);
}

export class RateLimiterMemcache extends RateLimiterStoreAbstract {
}

export class RateLimiterUnion {
    constructor(...limiters: RateLimiterAbstract[]);

    consume(key: string | number, points?: number): Promise<RateLimiterRes[]>;
}

export class RLWrapperBlackAndWhite extends RateLimiterAbstract {
    constructor(opts: IRLWrapperBlackAndWhiteOptions);
}

interface IRateLimiterQueueOpts {
    maxQueueSize?: number,
}

export class RateLimiterQueue {
    constructor(limiterFlexible: RateLimiterAbstract | BurstyRateLimiter, opts?: IRateLimiterQueueOpts);

    getTokensRemaining(key?: string | number): Promise<RateLimiterRes>;

    removeTokens(tokens: number, key?: string | number): Promise<RateLimiterRes>;
}

export class BurstyRateLimiter {
    constructor(rateLimiter: RateLimiterAbstract, burstLimiter: RateLimiterAbstract)

    consume(key: string | number, pointsToConsume?: number, options?: IRateLimiterMongoFunctionOptions): Promise<RateLimiterRes>;
}
