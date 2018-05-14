const expect = require('chai').expect;
const BlockedKeys = require('./BlockedKeys');

describe('BlockedKeys', () => {
  let blockedKeys;
  beforeEach(function() {
    blockedKeys = new BlockedKeys();
  });

  it('add blocked key', () => {
    blockedKeys.add('key', 5);
    expect(blockedKeys.msBeforeExpire('key') > 0).to.equal(true);
  });

  it('expire blocked key', (done) => {
    blockedKeys.add('key', 1);
    setTimeout(() => {
      expect(blockedKeys.msBeforeExpire('key')).to.equal(0);
      done();
    }, 1001);
  });

  it('check not blocked key', () => {
    blockedKeys.add('key', 1);
    expect(blockedKeys.msBeforeExpire('key1')).to.equal(0);
  });

  it('collect expired on add', (done) => {
    blockedKeys.add('key', 1);
    blockedKeys.add('key1', 1);
    setTimeout(() => {
      blockedKeys.add('key2', 1);
      expect(blockedKeys._keys.length).to.equal(1);
      done();
    }, 1100);
  });

  it('do not collect expired on msBeforeExpire', (done) => {
    blockedKeys.add('key', 1);
    setTimeout(() => {
      blockedKeys.msBeforeExpire('key');
      expect(blockedKeys._keys.length).to.equal(1);
      done();
    }, 1001);
  });

  it('duplicated keys do not brake collectExpired and msBeforeExpire', (done) => {
    blockedKeys.add('key', 1);
    blockedKeys.add('key', 2);
    setTimeout(() => {
      blockedKeys.add('key', 3);
      expect(blockedKeys.msBeforeExpire('key') > 2000).to.equal(true);
      done();
    }, 1001);
  });
});
