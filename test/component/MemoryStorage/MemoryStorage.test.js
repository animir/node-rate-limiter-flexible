const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const MemoryStorage = require('../../../lib/component/MemoryStorage/MemoryStorage');

describe('MemoryStorage', function MemoryStorageTest() {
  const testKey = 'test';
  const val = 34;
  let storage;

  this.timeout(5000);

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should set and get', (done) => {
    storage.set(testKey, val, 5);
    expect(storage.get(testKey).consumedPoints).to.equal(val);
    done();
  });

  it('should delete record on expire', (done) => {
    storage.set(testKey, val, 1);
    setTimeout(() => {
      expect(storage.get(testKey)).to.equal(null);
      done();
    }, 2000);
  });

  it('should incrby', (done) => {
    storage.set(testKey, val, 5);
    storage.incrby(testKey, 2);
    expect(storage.get(testKey).consumedPoints).to.equal(val + 2);
    done();
  });

  it('incrby should create record if it is not set', (done) => {
    storage.incrby(testKey, val, 5);
    expect(storage.get(testKey).consumedPoints).to.equal(val);
    done();
  });

  it('should delete record and return true, if it was there', () => {
    storage.set(testKey, val, 10);
    expect(storage.delete(testKey)).to.equal(true);
    expect(storage.get(testKey)).to.equal(null);
  });

  it('return false, if there is no record to delete', () => {
    expect(storage.delete(testKey)).to.equal(false);
  });

  it('should not fail in the absence of Timeout::unref', (done) => {
    // Node (where we most likely be running tests) provides `Timeout.prototype.unref`, however
    // MemoryStorage should run in environments where `Timeout.prototype.unref` is not provided
    // (e.g. browsers). For this test we remove `unref` from `Timeout.prototype` only for the
    // duration of this test, to verify that MemoryStorage.prototype.set won't throw.
    const handle = setTimeout(() => {}, 0);
    const isHandleObject = typeof handle === 'object' && !!handle.constructor;
    let timeoutUnref;
    if (isHandleObject) {
      timeoutUnref = handle.constructor.prototype.unref;
      delete handle.constructor.prototype.unref;
    }
    expect(() => new MemoryStorage().set('key', 0, 0.001)).to.not.throw();
    setTimeout(done, 250);
    if (isHandleObject) {
      handle.constructor.prototype.unref = timeoutUnref;
    }
  });
});
