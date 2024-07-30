const mongoose = require("mongoose");
const moment = require('moment')

const TransactionSchema = mongoose.Schema(
    {
        txnNumber: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true,
            default: 0
        },
        employeeId: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true
        },
        siNumber: {
            type: String,
            default: ''
        },
        voidNumber: {
            type: String,
            default: ''
        },
        transactionDate: {
            type: Date,
            required: true
        },

    },
    { timestamps: true }
);

TransactionSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Transaction", TransactionSchema);
