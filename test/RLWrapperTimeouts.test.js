const { describe, it } = require('mocha');
const { expect } = require('chai');
const sinon = require('sinon');
const RLWrapperTimeouts = require('../lib/RLWrapperTimeouts');
const RateLimiterAbstract = require('../lib/RateLimiterAbstract');

describe('RLWrapperTimeouts', () => {
  describe('should use wrapped limiter', () => {
    it('consume 1 point from wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 1,
        remainingPoints: 4,
        msBeforeNext: 1000,
        isFirstInDuration: true,
      };
      const limiter = new RateLimiterAbstract();
      limiter.consume = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.consume('testKey');

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.consume.calledOnceWith('testKey', 1, {})).to.be.true;

    });

    it('penalty 2 points from wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 3,
        remainingPoints: 2,
        msBeforeNext: 2000,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.penalty = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.penalty('testKey', 2);

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.penalty.calledOnceWith('testKey', 2, {})).to.be.true;
    });

    it('reward 1 point from wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 2,
        remainingPoints: 3,
        msBeforeNext: 1500,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.reward = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.reward('testKey', 1);

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.reward.calledOnceWith('testKey', 1, {})).to.be.true;
    });

    it('get points from wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 2,
        remainingPoints: 3,
        msBeforeNext: 1500,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.get = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.get('testKey');

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.get.calledOnceWith('testKey', {})).to.be.true;
    });

    it('set points in wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 0,
        remainingPoints: 5,
        msBeforeNext: 0,
        isFirstInDuration: true,
      };
      const limiter = new RateLimiterAbstract();
      limiter.set = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.set('testKey', 5, 3);

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.set.calledOnceWith('testKey', 5, 3, {})).to.be.true;
    });

    it('block key in wrapped limiter', async () => {
      const expectedResult = {
        consumedPoints: 5,
        remainingPoints: 0,
        msBeforeNext: 5000,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.block = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.block('testKey', 3);

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.block.calledOnceWith('testKey', 3, {})).to.be.true;
    });

    it('delete key in wrapped limiter', async () => {
      const expectedResult = true;
      const limiter = new RateLimiterAbstract();
      limiter.delete = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.delete('testKey');

      expect(res).to.equal(expectedResult);
      expect(limiter.delete.calledOnceWith('testKey')).to.be.true;
    });
  });

  describe('should timeout operations', () => {
    it('should timeout consume operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.consume = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.consume('testKey');
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should timeout get operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.get = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.get('testKey');
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should not timeout if operation completes in time', async () => {
      const expectedResult = {
        consumedPoints: 1,
        remainingPoints: 4,
        msBeforeNext: 1000,
        isFirstInDuration: true,
      };
      const limiter = new RateLimiterAbstract();
      limiter.consume = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      const res = await wrapper.consume('testKey');

      expect(res).to.deep.equal(expectedResult);
      expect(limiter.consume.calledOnceWith('testKey', 1, {})).to.be.true;
    });

    it('should timeout penalty operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.penalty = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.penalty('testKey', 2);
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should timeout reward operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.reward = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.reward('testKey', 1);
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should timeout set operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.set = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.set('testKey', 5, 3);
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should timeout block operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.block = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.block('testKey', 3);
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should timeout delete operation', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.delete = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve(true), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.delete('testKey');
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });
  });

  describe('should use insurance limiter on timeout', () => {
    it('should use insurance limiter on consume timeout', async () => {
      const expectedResult = {
        consumedPoints: 1,
        remainingPoints: 4,
        msBeforeNext: 1000,
        isFirstInDuration: true,
      };
      const limiter = new RateLimiterAbstract();
      limiter.consume = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.consume = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.consume('testKey');

      expect(res).to.deep.equal(expectedResult);
      expect(insuranceLimiter.consume.calledOnceWith('testKey', 1, {})).to.be.true;
    });

    it('should use insurance limiter on get timeout', async () => {
      const expectedResult = {
        consumedPoints: 2,
        remainingPoints: 3,
        msBeforeNext: 1500,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.get = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.get = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.get('testKey');

      expect(res).to.deep.equal(expectedResult);
      expect(insuranceLimiter.get.calledOnceWith('testKey', {})).to.be.true;
    });

    it('should reject if no insurance limiter on timeout', async () => {
      const limiter = new RateLimiterAbstract();
      limiter.consume = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const wrapper = new RLWrapperTimeouts({
        limiter,
        timeoutMs: 500,
      });

      try {
        await wrapper.consume('testKey');
        throw new Error('Expected to timeout but did not');
      } catch (err) {
        expect(err.message).to.equal('Operation timed out');
      }
    });

    it('should use insurance limiter on penalty timeout', async () => {
      const expectedResult = {
        consumedPoints: 3,
        remainingPoints: 2,
        msBeforeNext: 2000,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.penalty = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.penalty = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.penalty('testKey', 2);

      expect(res).to.deep.equal(expectedResult);
      expect(insuranceLimiter.penalty.calledOnceWith('testKey', 2, {})).to.be.true;
    });

    it('should use insurance limiter on reward timeout', async () => {
      const expectedResult = {
        consumedPoints: 2,
        remainingPoints: 3,
        msBeforeNext: 1500,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.reward = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.reward = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.reward('testKey', 1);

      expect(res).to.deep.equal(expectedResult);
      expect(insuranceLimiter.reward.calledOnceWith('testKey', 1, {})).to.be.true;
    });

    it('should use insurance limiter on block timeout', async () => {
      const expectedResult = {
        consumedPoints: 5,
        remainingPoints: 0,
        msBeforeNext: 5000,
        isFirstInDuration: false,
      };
      const limiter = new RateLimiterAbstract();
      limiter.block = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve({}), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.block = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.block('testKey', 3);

      expect(res).to.deep.equal(expectedResult);
      expect(insuranceLimiter.block.calledOnceWith('testKey', 3, {})).to.be.true;
    });

    it('should use insurance limiter on delete timeout', async () => {
      const expectedResult = true;
      const limiter = new RateLimiterAbstract();
      limiter.delete = sinon.stub().returns(new Promise((resolve) => {
        setTimeout(() => resolve(true), 1000);
      }));

      const insuranceLimiter = new RateLimiterAbstract();
      insuranceLimiter.delete = sinon.stub().resolves(expectedResult);

      const wrapper = new RLWrapperTimeouts({
        limiter,
        insuranceLimiter,
        timeoutMs: 500,
      });

      const res = await wrapper.delete('testKey');

      expect(res).to.equal(expectedResult);
      expect(insuranceLimiter.delete.calledOnceWith('testKey')).to.be.true;
    });
  });

});
