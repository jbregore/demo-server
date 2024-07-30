const mongoose = require("mongoose");

const ReportsSchema = mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    storeCode: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    posDate: {
      type: String,
      required: true,
    },
    data: {
      type: Object,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Report", ReportsSchema, "report_logs");
