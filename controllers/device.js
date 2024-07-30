const HttpError = require('../middleware/http-error');
const { getNetworkAdapters } = require('../utils/device.util');
const { NETWORK_INTERFACES } = require('../constants/device.constant');

// Get all valid MAC Addresses for Wi-Fi
exports.getAllHardwareIds = async (req, res, next) => {
  try {
    const adapters = await getNetworkAdapters();
    const macAddresses = adapters
      .filter((a) => {
        const adapterName = a.name.toLowerCase();
        return NETWORK_INTERFACES.some((iface) => adapterName.includes(iface.toLowerCase()));
      })
      .map((a) => a.macAddress);

    return res.status(200).json({ hardwareIds: macAddresses });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Something went wrong, please try again.', 500);

    return next(error);
  }
};
