const http = require('http');

const HTTP_OK = 200;

class EtcdClient {
  /**
   * Constructs a Etcd client instance with the given server and port.
   *
   * @param {string} server
   * @param {number} port
   */
  constructor(server, port) {
    this.server = server;
    this.port = port;
  }

  /**
   * Only sets the value for the given key if it did not exist yet.
   *
   * @param {string} key
   * @param {object} value
   * @returns the value set or null if they key already existed.
   */
  async addKey(key, value) {
    const compare = [
      {
        result: 'EQUAL',
        target: 'VERSION',
        version: '0',
        key: this._encodeKey(key),
      },
    ];
    const success = [
      {
        request_put: {
          key: this._encodeKey(key),
          value: this._encodeValue(value),
        },
      },
    ];

    const response = await this._httpPost(this._getPath('kv', 'txn'), { compare, success });
    if (response.succeeded) {
      return value;
    }
    return null;
  }

  /**
   * Simply sets a value for the given key.
   *
   * @param {string} key
   * @param {object} value
   * @returns the value set
   */
  async setKey(key, value) {
    const data = { key: this._encodeKey(key), value: this._encodeValue(value) };

    await this._httpPost(this._getPath('kv', 'put'), data);

    return value;
  }

  /**
   * Sets a new value for a key if the old value is still present.
   *
   * @param {string} key
   * @param {object} oldValue
   * @param {object} newValue
   * @returns the value set or null if they value could not be set.
   */
  async setKeyIf(key, oldValue, newValue) {
    const compare = [
      {
        result: 'EQUAL',
        target: 'VALUE',
        key: this._encodeKey(key),
        value: this._encodeValue(oldValue),
      },
    ];
    const success = [
      {
        request_put: {
          key: this._encodeKey(key),
          value: this._encodeValue(newValue),
        },
      },
    ];

    const response = await this._httpPost(this._getPath('kv', 'txn'), { compare, success });
    if (response.succeeded) {
      return newValue;
    }
    return null;
  }

  /**
   * Gets the value for the given key.
   *
   * @param {string} key
   * @returns object or null
   */
  async getKey(key) {
    const data = { key: this._encodeKey(key) };

    const response = await this._httpPost(this._getPath('kv', 'range'), data);

    return response.count === '1' ? this._decodeValue(response.kvs[0].value) : null;
  }

  /**
   * Removes the given key.
   *
   * @param {string} key
   * @returns the value removed or null if the value was not found
   */
  async removeKey(key) {
    const data = { key: this._encodeKey(key), prev_kv: true };

    const response = await this._httpPost(this._getPath('kv', 'deleterange'), data);

    if (response.deleted === '1') {
      return this._decodeValue(response.prev_kvs[0].value);
    }
    return null;
  }

  _httpPost(path, body) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body, null, 2);

      const options = {
        hostname: this.server,
        port: this.port,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
        },
      };

      const request = http.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk.toString();
        });

        response.on('end', () => {
          if (response.statusCode === HTTP_OK) {
            const post = JSON.parse(data);
            resolve(post);
          } else {
            reject(new Error('Received status code other than 201.'));
          }
        });

        response.on('error', (error) => {
          reject(error);
        });
      });

      request.write(payload);
      request.end();
    });
  }

  _getPath(service, action) {
    return `/v3/${service}/${action}`;
  }

  _encodeKey(key) {
    return Buffer.from(key).toString('base64');
  }

  _encodeValue(value) {
    return Buffer.from(JSON.stringify(value)).toString('base64');
  }

  _decodeValue(value) {
    return JSON.parse(Buffer.from(value, 'base64').toString());
  }
}

module.exports = EtcdClient;
