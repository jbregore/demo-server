const mongoose = require("mongoose");
const moment = require('moment')

const TransactionAmountSchema = mongoose.Schema(
    {
        txnNumber: {
            type: String,
            required: true
        },
        vatableSale: {
            type: Number,
            required: true,
            default: 0
        },
        vatAmount: {
            type: Number,
            required: true,
            default: 0
        },
        vatExempt: {
            type: Number,
            required: true,
            default: 0
        },
        vatZeroRated: {
            type: Number,
            required: true,
            default: 0
        },
        nonVat: {
            type: Number,
            required: true,
            default: 0
        },
        totalAmount: {
            type: Number,
            required: true,
            default: 0
        },
        employeeId: {
            type: String,
            required: true,
            default: 0
        },
        storeCode: {
            type: String,
            required: true,
            default: 0
        },
        transactionDate: {
            type: Date,
            required: true,
            default: 0
        }
    },
    { timestamps: true }
);

TransactionAmountSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Transaction Amount", TransactionAmountSchema);
