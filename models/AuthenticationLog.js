const mongoose = require("mongoose");

const AuthenticationLogs = mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true,
    },
    storeCode: {
      type: String,
      required: true,
    },
    posDate: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "AuthenticationLog",
  AuthenticationLogs,
  "auth_logs"
);
