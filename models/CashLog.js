const mongoose = require("mongoose");
const moment = require('moment')

const CashLogSchema = mongoose.Schema(
    {
        reportCashLogId: {
            type: String,
            required: true
        },
        peso1000: {
            type: Number,
            required: true,
            default: 0
        },
        peso500: {
            type: Number,
            required: true,
            default: 0
        },
        peso200: {
            type: Number,
            required: true,
            default: 0
        },
        peso100: {
            type: Number,
            required: true,
            default: 0
        },
        peso50: {
            type: Number,
            required: true,
            default: 0
        },
        peso20: {
            type: Number,
            required: true,
            default: 0
        },
        peso10: {
            type: Number,
            required: true,
            default: 0
        },
        peso5: {
            type: Number,
            required: true,
            default: 0
        },
        peso1: {
            type: Number,
            required: true,
            default: 0
        },
        cent25: {
            type: Number,
            required: true,
            default: 0
        },
        cent10: {
            type: Number,
            required: true,
            default: 0
        },
        cent05: {
            type: Number,
            required: true,
            default: 0
        },
        cent01: {
            type: Number,
            required: true,
            default: 0
        },
        total: {
            type: Number,
            required: true,
        },
        employeeId: {
            type: String,
            required: true
        },
        cashierFirstName: {
            type: String,
            required: true
        },
        cashierLastName: {
            type: String,
            required: true
        },
        shift: {
            type: String,
            required: true,
            enum: [
                'OPENING',
                'CLOSING'
            ]
        },
        txnNumber: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true,
            enum: [
                'initial',
                'cash takeout'
            ]
        },
        branchCode: {
            type: String,
            required: true
        },
        cashDate: {
            type: Date,
            required: true
        }

    },
    { timestamps: true }
);

CashLogSchema.pre('save', function(next) {
    const [date, time] = moment().utc().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  


module.exports = mongoose.model("Cash Log", CashLogSchema);
