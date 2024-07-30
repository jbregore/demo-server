const mongoose = require("mongoose");

const ResetCountSchema = mongoose.Schema(
  {
    storeCode: {
      type: String,
      required: true,
    },
    posDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ResetCount", ResetCountSchema, "reset_count");
