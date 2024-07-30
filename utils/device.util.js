const { exec } = require('child_process');

const parseIfconfig = (output) => {
  const lines = output.split('\r\n');
  const adapters = [];

  let currentAdapter = null;
  lines.forEach((line) => {
    const nameMatch = line.match(/^Wireless LAN adapter (.*):$/);
    if (nameMatch) {
      currentAdapter = {
        name: nameMatch[1],
        macAddress: null
      };
    }

    const macMatch = line.match(/^\s*Physical Address[.\s]*:\s*(.*)$/);
    if (macMatch && currentAdapter) {
      currentAdapter.macAddress = macMatch[1].trim().replace(/-/g, ':').toLowerCase();

      adapters.push(currentAdapter);
      currentAdapter = null;
    }
  });

  return adapters;
};

const getNetworkAdapters = () => {
  return new Promise((resolve, reject) => {
    exec('ipconfig /all', (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr) {
        reject(stderr);
        return;
      }

      const adapters = parseIfconfig(stdout);
      resolve(adapters);
    });
  });
};

module.exports = {
  parseIfconfig,
  getNetworkAdapters
};
