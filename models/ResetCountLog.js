const mongoose = require("mongoose");

const ResetCountLogSchema = mongoose.Schema(
    {
        resetCountLogId: {
            type: String,
            required: true
        },
        lastStoreCode: {
            type: String,
            required: true
        },
        resetDate: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Reset Count Log", ResetCountLogSchema);
