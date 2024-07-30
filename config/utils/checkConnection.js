const dns = require('dns');

module.exports = function () {
  let isConnected = false;

  dns.lookup('google.com', function (err) {
    if (err && err.code == 'ENOTFOUND') {
      isConnected = false;
    } else {
      isConnected = true;
    }

    return isConnected;
  });
};
