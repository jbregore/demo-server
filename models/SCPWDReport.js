const mongoose = require("mongoose");
const moment = require('moment')

const SCPWDReportSchema = mongoose.Schema(
    {
        scPwdReportId: {
            type: String,
            required: true
        },
        firstName: {
            type: String,
            required: true
        },
        lastName: {
            type: String,
            required: true
        },
        idNumber: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        },
        grossSales: {
            type: Number,
            required: true
        },
        discountAmount: {
            type: Number,
            required: true
        },
        txnNumber: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        },
        reportDate: {
            type: Date,
            required: true
        },
    },
    { timestamps: true }
);

SCPWDReportSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("SCPWD Report", SCPWDReportSchema);
