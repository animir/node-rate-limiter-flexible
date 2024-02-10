// This object is used for setting the options for the redis client,
// so we can connect to the redis server in Docker, using ipv4 and not
// ipv6, which the client defaults to useing
module.exports = {
  socket: {
    host: '127.0.0.1',
    port: 6379,
  },
};
