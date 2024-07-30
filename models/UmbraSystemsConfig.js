const mongoose = require('mongoose');

const UmbraSystemsConfigSchema = mongoose.Schema(
  {
    endpoint: {
      type: String,
      required: true
    },
    apiKey: {
      type: String,
    },
    deviceId: {
      type: Number,
    },
    deviceName: {
      type: String,
    },
    status: {
      type: String,
      required: true,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('umbra_systems_config', UmbraSystemsConfigSchema);
