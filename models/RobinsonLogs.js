const mongoose = require('mongoose');

const RobinsonLogsSchema = mongoose.Schema(
  {
    transactionDate: {
      type: String,
      required: true
    },
    storeCode: {
      type: String,
      required: true
    },
    batchNumber: {
      type: Number,
      required: true
    },
    reprint: {
      type: Array,
      required: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('robinson_logs', RobinsonLogsSchema);
