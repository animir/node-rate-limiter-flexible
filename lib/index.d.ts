export interface RateLimiterRes {
    readonly msBeforeNext: number;
    readonly remainingPoints: number;
    readonly consumedPoints: number;
    readonly isFirstInDuration: boolean;
}

export class RateLimiterAbstract {
    constructor(opts: IRateLimiterOptions);

    consume(key: string | number, pointsToConsume?: number): Promise<RateLimiterRes>;

    penalty(key: string | number, points?: number): Promise<RateLimiterRes>;

    reward(key: string | number, points?: number): Promise<RateLimiterRes>;

    block(key: string | number, secDuration: number): Promise<RateLimiterRes>;

    get(key: string | number): Promise<RateLimiterRes>;
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

interface IRateLimiterStoreOptions {
    storeClient: any;
    storeType?: string;
    inmemoryBlockOnConsumed?: number;
    inmemoryBlockDuration?: number;
    insuranceLimiter?: RateLimiterAbstract;
    dbName?: string;
    tableName?: string;
    timeoutMs?: number;
}

interface ICallbackReady {
    (error?: Error): void;
}

interface IRLWrapperBlackAndWhiteOptions {
    limiter: RateLimiterAbstract;
    blackList: string [] | number[];
    whiteList: string[] | number[];

    isBlack(key: string | number): boolean;

    isWhite(key: string | number): boolean;

    runActionAnyway: boolean;
}

export class RateLimiterMemory extends RateLimiterAbstract {
    constructor(opts: IRateLimiterOptions);
}

export class RateLimiterCluster extends RateLimiterAbstract {
    constructor(opts: IRateLimiterStoreOptions);
}

export class RateLimiterClusterMaster {
    constructor();
}

export class RateLimiterClusterMasterPM2 {
    constructor(pm2: any);
}

export class RateLimiterRedis extends RateLimiterStoreAbstract {
}

export class RateLimiterMongo extends RateLimiterStoreAbstract {
}

export class RateLimiterMySQL extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreOptions, cb?: ICallbackReady);
}

export class RateLimiterPostgres extends RateLimiterStoreAbstract {
    constructor(opts: IRateLimiterStoreOptions, cb?: ICallbackReady);
}

export class RateLimiterUnion {
    constructor(...limiters: RateLimiterAbstract[]);

    consume(key: string | number, points?: number): Promise<RateLimiterRes>[];
}

export class RLWrapperBlackAndWhite {
    constructor(opts: IRLWrapperBlackAndWhiteOptions);
}