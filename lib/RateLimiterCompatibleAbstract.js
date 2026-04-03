module.exports = class RateLimiterCompatibleAbstract {
  get blockDuration() {
    throw new Error("You have to implement the getter 'blockDuration'!");
  }

  set blockDuration(value) {
    throw new Error("You have to implement the setter 'blockDuration'!");
  }

  get execEvenly() {
    throw new Error("You have to implement the getter 'execEvenly'!");
  }

  set execEvenly(value) {
    throw new Error("You have to implement the setter 'execEvenly'!");
  }

  consume() {
    throw new Error("You have to implement the method 'consume'!");
  }

  penalty() {
    throw new Error("You have to implement the method 'penalty'!");
  }

  reward() {
    throw new Error("You have to implement the method 'reward'!");
  }

  get() {
    throw new Error("You have to implement the method 'get'!");
  }

  set() {
    throw new Error("You have to implement the method 'set'!");
  }

  block() {
    throw new Error("You have to implement the method 'block'!");
  }

  delete() {
    throw new Error("You have to implement the method 'delete'!");
  }
};
