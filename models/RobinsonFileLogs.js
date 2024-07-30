const mongoose = require('mongoose');

const RobinsonFilesLogSchema = mongoose.Schema(
    {
        fileName: {
            type: String,
            required: true
        },
        sent: {
            type: Boolean,
            required: false
        },
        transactionDate: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('robinson_files_logs', RobinsonFilesLogSchema);