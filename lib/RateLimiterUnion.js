const RateLimiterAbstract = require('./RateLimiterAbstract');

module.exports = class RateLimiterUnion {
  constructor(...limiters) {
    if (limiters.length < 1) {
      throw new Error('RateLimiterUnion: at least one limiter have to be passed');
    }
    limiters.forEach((limiter) => {
      if (!(limiter instanceof RateLimiterAbstract)) {
        throw new Error('RateLimiterUnion: all limiters have to be instance of RateLimiterAbstract');
      }
    });

    this._limiters = limiters;
  }

  consume(key, points = 1) {
    return new Promise((resolve, reject) => {
      const promises = [];
      this._limiters.forEach((limiter) => {
        promises.push(limiter.consume(key, points).catch(rej => ({ rejected: true, rej })));
      });

      Promise.all(promises)
        .then((res) => {
          const resObj = {};
          let rejected = false;

          res.forEach((item) => {
            if (item.rejected === true) {
              rejected = true;
            }
          });

          for (let i = 0; i < res.length; i++) {
            if (rejected && res[i].rejected === true) {
              resObj[this._limiters[i].keyPrefix] = res[i].rej;
            } else if (!rejected) {
              resObj[this._limiters[i].keyPrefix] = res[i];
            }
          }

          if (rejected) {
            reject(resObj);
          } else {
            resolve(resObj);
          }
        });
    });
  }
};
