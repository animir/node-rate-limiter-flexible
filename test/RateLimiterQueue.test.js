const { describe, it } = require('mocha');
const { expect } = require('chai');
const RateLimiterMemory = require('../lib/RateLimiterMemory');
const BurstyLimiter = require('../lib/BurstyRateLimiter');
const RateLimiterQueue = require('../lib/RateLimiterQueue');
const RateLimiterQueueError = require('../lib/component/RateLimiterQueueError');

describe('RateLimiterQueue with FIFO queue', function RateLimiterQueueTest() {
  this.timeout(5000);

  it('remove 1 token works and 1 remaining', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 2, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1)
      .then((remainingTokens) => {
        expect(remainingTokens).to.equal(1);
        done();
      });
  });

  it('remove 2 tokens from bursty limiter and returns correct remainingTokens 0', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 3 });
    const burstyLimiter = new BurstyLimiter(rlMemory, blMemory);
    const rlQueue = new RateLimiterQueue(burstyLimiter);
    const startTime = Date.now();
    rlQueue.removeTokens(1)
      .then((remainingTokens1) => {
        expect(remainingTokens1).to.equal(0);
        rlQueue.removeTokens(1)
          .then((remainingTokens2) => {
            expect(remainingTokens2).to.equal(0);
            expect(Date.now() - startTime < 1000).to.equal(true);
            done();
          });
      });
  });

  it('remove 2 tokens from bursty limiter and wait 1 more', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const blMemory = new RateLimiterMemory({ points: 1, duration: 3 });
    const burstyLimiter = new BurstyLimiter(rlMemory, blMemory);
    const rlQueue = new RateLimiterQueue(burstyLimiter);
    const startTime = Date.now();
    rlQueue.removeTokens(1)
      .then(() => {
        rlQueue.removeTokens(1)
          .then(() => {
            rlQueue.removeTokens(1)
              .then((remainingTokens) => {
                expect(remainingTokens).to.equal(0);
                expect(Date.now() - startTime >= 999).to.equal(true);
                done();
              });
          });
      });
  });

  it('remove all tokens works and 0 remaining', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 2, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(2)
      .then((remainingTokens) => {
        expect(remainingTokens).to.equal(0);
        done();
      });
  });

  it('return error if try to remove more tokens than allowed', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 2, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(3)
      .then(() => {
      })
      .catch((err) => {
        expect(err instanceof RateLimiterQueueError).to.equal(true);
        done();
      });
  });

  it('queues 1 request and fire it after 1 second', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    const time = Date.now();
    rlQueue.removeTokens(1).then(() => {
      rlQueue.removeTokens(1).then((remainingTokens) => {
        expect(remainingTokens).to.equal(0);
        expect(Date.now() - time >= 999).to.equal(true);
        done();
      });
    });
  });

  it('respects order of queued callbacks', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    let index;
    rlQueue.removeTokens(1).then(() => {
      index = 0;
    });
    rlQueue.removeTokens(1).then(() => {
      expect(index).to.equal(0);
      index = 1;
    });
    rlQueue.removeTokens(1).then(() => {
      expect(index).to.equal(1);
      index = 2;
    });
    rlQueue.removeTokens(1).then(() => {
      expect(index).to.equal(2);
      done();
    });
  });

  it('return error if queue length reaches maximum', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory, { maxQueueSize: 1 });
    rlQueue.removeTokens(1).then(() => {
    });
    rlQueue.removeTokens(1).then(() => {
      done();
    });
    rlQueue.removeTokens(1)
      .then(() => {
        done(new Error('must not allow to queue'));
      })
      .catch((err) => {
        expect(err instanceof RateLimiterQueueError).to.equal(true);
      });
  });

  it('rejects a queued request that expires before it is fulfilled (expiresUnixAt)', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 2 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    // Consume the only available token so the next request has to be queued.
    rlQueue.removeTokens(1).then(() => {
      // Allow the queued request to wait only until the current second, so it is
      // still queued (and overdue) when the FIFO processor next runs.
      const expiresUnixAt = Math.floor(Date.now() / 1000);
      rlQueue.removeTokens(1, 'limiter', expiresUnixAt)
        .then(() => {
          done(new Error('queued request should have been rejected as expired'));
        })
        .catch((err) => {
          expect(err instanceof RateLimiterQueueError).to.equal(true);
          done();
        });
    });
  });

  it('does not reject a queued request whose expiresUnixAt is still in the future', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1).then(() => {
      const expiresUnixAt = Math.floor(Date.now() / 1000) + 10;
      rlQueue.removeTokens(1, 'limiter', expiresUnixAt)
        .then((remainingTokens) => {
          expect(remainingTokens).to.equal(0);
          done();
        })
        .catch(done);
    });
  });

  it('expires only the overdue request and still fulfils a later non-expiring one', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    // Consume the only token so the following requests are queued behind it.
    rlQueue.removeTokens(1).then(() => {
      let expiredRejected = false;
      // A: carries a deadline at the current second -> overdue when FIFO runs.
      const expiresUnixAt = Math.floor(Date.now() / 1000);
      rlQueue.removeTokens(1, 'limiter', expiresUnixAt)
        .then(() => done(new Error('request A should have been rejected as expired')))
        .catch((err) => {
          expect(err instanceof RateLimiterQueueError).to.equal(true);
          expiredRejected = true;
        });
      // B: no deadline -> survives the sweep and must still be fulfilled after
      // the overdue A is swept out of the queue.
      rlQueue.removeTokens(1)
        .then((remainingTokens) => {
          expect(expiredRejected).to.equal(true);
          expect(remainingTokens).to.equal(0);
          done();
        })
        .catch(done);
    });
  });

  it('never disables the expiry sweep while a deadline request is in flight (regression)', () => {
    // Regression for the _hasExpiringRequests fast-path optimization. The defect
    // only surfaces with an asynchronous underlying limiter (e.g. Redis/Mongo):
    // while a deadline-bearing request is being consumed it is momentarily
    // shift()ed out of the internal queue, and a second _processFIFO can sweep
    // the temporarily empty queue. That interleaving is not deterministically
    // reproducible through the public API, so we drive the internal queue
    // directly to lock the invariant: the sweep must never turn the flag off
    // (which would permanently disable expiry for an item the rate-limit retry
    // path later unshift()es back in, stranding it past its deadline forever).
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 100 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    return rlQueue.removeTokens(1).then(() => {
      const internal = rlQueue._queueLimiters.limiter;
      let rejection = null;
      const overdue = Math.floor(Date.now() / 1000) - 1; // already past its deadline
      // Arm the flag exactly as enqueueing a deadline-bearing request would.
      internal._queueRequest(() => {}, (err) => { rejection = err; }, 1, overdue);
      expect(internal._hasExpiringRequests).to.equal(true);
      // In-flight window: the sole deadline-bearing item is shifted out and a
      // sweep runs over the now-empty queue.
      const inFlight = internal._queue.shift();
      internal._processFIFO();
      expect(internal._hasExpiringRequests).to.equal(true); // must stay armed
      // The rate-limit retry path re-inserts the in-flight item without going
      // through _queueRequest; the next sweep must still expire it.
      internal._queue.unshift(inFlight);
      internal._processFIFO();
      expect(rejection instanceof RateLimiterQueueError).to.equal(true);
    });
  });

  it('getTokensRemaining works', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 2, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1)
      .then(() => {
        rlQueue.getTokensRemaining()
          .then((tokensRemaining) => {
            expect(tokensRemaining).to.equal(1);
            done();
          });
      });
  });

  it('getTokensRemaining returns maximum if internal limiter by key does not exist', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 23, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.getTokensRemaining('test')
      .then((tokensRemaining) => {
        expect(tokensRemaining).to.equal(23);
        done();
      });
  });

  it('creates internal instance by key and removes tokens from it', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 2, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1, 'customkey')
      .then((remainingTokens) => {
        expect(remainingTokens).to.equal(1);
        rlQueue.getTokensRemaining()
          .then((defaultTokensRemaining) => {
            expect(defaultTokensRemaining).to.equal(2);
            done();
          });
      });
  });

  it('getTokensRemaining returns maximum if internal limiter does not have data', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 23, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1, 'nodata')
      .then(() => {
        setTimeout(() => {
          rlQueue.getTokensRemaining('nodata')
            .then((tokensRemaining) => {
              expect(tokensRemaining).to.equal(23);
              done();
            });
        }, 1001)
      })
  });

  it('works with no opts (uses default maxQueueSize)', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory);
    rlQueue.removeTokens(1)
      .then((remainingTokens) => {
        expect(remainingTokens).to.equal(0);
        rlQueue.removeTokens(1)
          .then((remainingTokens2) => {
            expect(remainingTokens2).to.equal(0);
            done();
          });
      });
  });

  it('works with explicit maxQueueSize option', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory, { maxQueueSize: 5 });
    rlQueue.removeTokens(1)
      .then(() => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
          promises.push(rlQueue.removeTokens(1));
        }
        rlQueue.removeTokens(1)
          .then(() => {
            done(new Error('should have rejected - queue full'));
          })
          .catch((err) => {
            expect(err instanceof RateLimiterQueueError).to.equal(true);
            expect(err.message).to.include('maximum 5');
            done();
          });
      });
  });

  it('works with empty opts object (runtime fallback to default maxQueueSize)', (done) => {
    const rlMemory = new RateLimiterMemory({ points: 1, duration: 1 });
    const rlQueue = new RateLimiterQueue(rlMemory, {});
    rlQueue.removeTokens(1)
      .then((remainingTokens) => {
        expect(remainingTokens).to.equal(0);
        rlQueue.removeTokens(1)
          .then((remainingTokens2) => {
            expect(remainingTokens2).to.equal(0);
            done();
          })
          .catch((err) => {
            done(new Error('should not reject: ' + err.message));
          });
      });
  });

  it('works correctly with underlying execEvenly limiter (no extra wait from stale msBeforeNext)', (done) => {
    const rlMemory = new RateLimiterMemory({
      points: 2,
      duration: 1,
      execEvenly: true,
      execEvenlyMinDelayMs: 100,
    });
    const rlQueue = new RateLimiterQueue(rlMemory);
    const startTime = Date.now();

    rlQueue.removeTokens(1)
      .then(() => {

        rlQueue.removeTokens(1)
          .then(() => {
            const diff = Date.now() - startTime;
            expect(diff).to.be.closeTo(500, 100);
            done();
          })
          .catch((err) => {
            done(err);
          });
      })
      .catch((err) => {
        done(err);
      });
  });
});
