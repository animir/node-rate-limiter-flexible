export class RateLimiterQueueError extends Error {

  constructor(message?: string, extra?: string);

  readonly name: string;
  readonly message: string;
  readonly extra: string;

}
