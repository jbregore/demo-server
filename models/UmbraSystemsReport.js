const mongoose = require('mongoose');

const UmbraSystemsReportSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true
    },
    posDeviceId: {
      type: Number,
      required: true
    },
    data: {
      type: Object,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('umbra_systems_report', UmbraSystemsReportSchema);
