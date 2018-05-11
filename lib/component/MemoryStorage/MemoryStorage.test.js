const expect = require('chai').expect;
const MemoryStorage = require('./MemoryStorage');

describe('MemoryStorage', function() {
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

});