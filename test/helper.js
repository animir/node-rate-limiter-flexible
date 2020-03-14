// Mock eval function with almost the same behaviour as Lua script
// It gives 99% sure, that all work as expected
function redisEvalMock(redisMockClient) {
  return (script, numberOfKeys, rlKey, points, secDuration, callback) => {
    const multi = redisMockClient.multi();
    if (secDuration > 0) {
      multi.set(rlKey, 0, 'EX', secDuration, 'NX');
    }

    multi.incrby(rlKey, points)
      .pttl(rlKey)
      .exec((err, res) => {
        const finalRes = secDuration > 0
          ? [res[1], res[2]]
          : res;
        callback(err, finalRes);
      });
  };
}

// emulate closed RedisClient
class RedisClient {
  constructor(redisMockClient) {
    this._redisMockClient = redisMockClient;
  }
  multi() {
    const multi = this._redisMockClient.multi();
    multi.exec = (cb) => {
      cb(new Error('closed'), []);
    };

    return multi;
  }
}

function getRedisClientClosed(redisClient) {
  const redisClientClosedRaw = new RedisClient(redisClient);
  return new Proxy(redisClientClosedRaw, {
    get: (func, name) => {
      if (name === 'defineCommand') {
        return undefined;
      }
      if (name in redisClientClosedRaw) {
        return redisClientClosedRaw[name];
      }
      return function (...args) {
        const cb = args.pop();
        cb(Error('closed'));
      };
    },
  });
}

module.exports = {
  redisEvalMock,
  getRedisClientClosed,
};
