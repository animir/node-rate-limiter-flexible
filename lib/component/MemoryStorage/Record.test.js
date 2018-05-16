const { describe, it, beforeEach } = require('mocha');
const { expect } = require('chai');
const Record = require('./Record');

describe('MemoryStorage Record', () => {
  let record;
  beforeEach(() => {
    record = new Record();
  });

  it('value set with cast to int and get', () => {
    record.value = '123';
    expect(record.value).to.equal(123);
  });

  it('expiresAt set unix time and get Date', () => {
    const now = Date.now();
    record.expiresAt = now;
    expect(record.expiresAt.getTime()).to.equal(now);
  });
});
