import mocha from 'mocha';
import { expect } from 'chai';
import RateLimiterQueueError from '../../lib/component/RateLimiterQueueError';

const { describe, it } = mocha;

describe('RateLimiterQueueError', () => {
  it('supports extra argument in constructor', (done) => {
    const err = new RateLimiterQueueError('test', 'extra');
    expect(err.extra).to.equal('extra');
    done();
  });
});
