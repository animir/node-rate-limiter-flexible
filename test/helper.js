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

module.exports = {
  redisEvalMock,
};
