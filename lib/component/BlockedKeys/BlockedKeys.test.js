const expect = require('chai').expect;
const BlockedKeys = require('./BlockedKeys');

describe('BlockedKeys', function() {
  let blockedKeys;
  beforeEach(function() {
    blockedKeys = new BlockedKeys();
  });

  it('add blocked key', () => {
    blockedKeys.add('key', 5);
    blockedKeys.collectExpired();
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

  it('do not collect expired on add', (done) => {
    blockedKeys.add('key', 1);
    blockedKeys.add('key1', 1);
    setTimeout(() => {
      blockedKeys.add('key2', 1);
      expect(Object.keys(blockedKeys._keys).length).to.equal(3);
      done();
    }, 1001);
  });

  it('collect expired on add if there more than 999 blocked keys', (done) => {
    for(let i = 0; i < 1000 ; i++) {
      blockedKeys.add(`key${i}`, 1);
    }

    setTimeout(() => {
      blockedKeys.add('key1', 1);
      expect(Object.keys(blockedKeys._keys).length === 1 && blockedKeys._length === 1).to.equal(true);
      done();
    }, 1001);
  });

  it('do not collect expired when key is not blocked', (done) => {
    blockedKeys.add('key', 1);
    setTimeout(() => {
      blockedKeys.msBeforeExpire('key');
      expect(Object.keys(blockedKeys._keys).length === 1 && blockedKeys._length === 1).to.equal(true);
      done();
    }, 1001);
  });

  it('collect expired when key is blocked', (done) => {
    blockedKeys.add('key', 1);
    blockedKeys.add('blocked', 2);
    setTimeout(() => {
      blockedKeys.msBeforeExpire('blocked');
      expect(Object.keys(blockedKeys._keys).length).to.equal(1);
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
