import mocha from "mocha";
import { expect } from "chai";
import RLWrapperBlackAndWhite from "../lib/RLWrapperBlackAndWhite.js";
import RateLimiterMemory from "../lib/RateLimiterMemory.js";
const { describe, it } = mocha;

describe('RLWrapperBlackAndWhite ', () => {
  it('consume if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === 0 && res.consumedPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('rejected on consume if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .consume('blacked')
      .then(() => {
        done(Error('must not consume'));
      })
      .catch((rej) => {
        expect(rej.remainingPoints === 0 && rej.consumedPoints === 0).to.equal(true);
        done();
      });
  });

  it('block if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .block('test', 30)
      .then((res) => {
        expect(res.msBeforeNext > 1000 && res.msBeforeNext <= 30000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('block resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .block('blacked', 30)
      .then((res) => {
        expect(res.msBeforeNext > 30000).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 2,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .penalty('test', 1)
      .then((res) => {
        expect(res.consumedPoints === 1).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .penalty('blacked', 1)
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reward if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped.consume('test').then(() => {
      limiterWrapped
        .reward('test', 1)
        .then((res) => {
          expect(res.consumedPoints === 0).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });

  it('reward resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .reward('blacked', 1)
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('get if not blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped.consume('test').then(() => {
      limiterWrapped
        .get('test')
        .then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        })
        .catch(() => {
          done(Error('must not reject'));
        });
    });
  });

  it('get resolved if blacked', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      blackList: ['blacked'],
    });
    limiterWrapped
      .get('blacked')
      .then((res) => {
        expect(res.consumedPoints === 0 && res.remainingPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve consume if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .consume('white', 3)
      .then((res) => {
        expect(res.consumedPoints === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve block if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .block('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve penalty if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .penalty('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve reward if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .reward('white', 3)
      .then((res) => {
        expect(res.msBeforeNext === 0).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('resolve get if whited', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['white'],
    });

    limiterWrapped
      .get('white')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume resolved if in white and in black', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      whiteList: ['test'],
      blackList: ['test'],
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume resolved if isWhiteListed func returns true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isWhiteListed: key => key === 'test',
    });
    limiterWrapped
      .consume('test')
      .then((res) => {
        expect(res.remainingPoints === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('consume rejected if isBlackListed func returns true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
    });
    limiterWrapped
      .consume('test')
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch((rej) => {
        expect(rej.msBeforeNext === Number.MAX_SAFE_INTEGER).to.equal(true);
        done();
      });
  });

  it('consume even if black listed when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .consume('test')
      .then(() => {
        done(Error('must not resolve'));
      })
      .catch(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        });
      });
  });

  it('block even if black listed when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .block('test', 30)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.msBeforeNext > 1000).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('penalty even if blacked when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .penalty('test', 1)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === 1).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('reward even if blacked when runAction set to true', (done) => {
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === 'test',
      runActionAnyway: true,
    });
    limiterWrapped
      .reward('test', 1)
      .then(() => {
        limiterWrapped.get('test').then((res) => {
          expect(res.consumedPoints === -1).to.equal(true);
          done();
        });
      })
      .catch(() => {
        done(Error('must not reject'));
      });
  });

  it('delete data straight on limiter even if key is black or white listed', (done) => {
    const testKey = 'test';
    const limiter = new RateLimiterMemory({
      points: 1,
      duration: 1,
    });

    const limiterWrapped = new RLWrapperBlackAndWhite({
      limiter,
      isBlackListed: key => key === testKey,
      isWhiteListed: key => key === testKey,
    });
    limiter.consume(testKey)
      .then(() => {
        limiterWrapped.delete(testKey)
          .then((res) => {
            expect(res).to.equal(true);
            done();
          });
      });
  });
});
