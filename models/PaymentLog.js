const mongoose = require("mongoose");
const moment = require('moment')

const PaymentLogSchema = mongoose.Schema(
    {
        paymentLogId: {
            type: String,
            required: true
        },
        customPaymentKey: {
            type: String,
            default: ''
        },
        type: {
            type: String,
            default: ''
        },
        amount: {
            type: Number,
            required: true
        },
        excessGiftCardType: {
            type: String,
            default: ''
        },
        excessGiftCardAmount: {
            type: Number,
            default: 0
        },
        excessCash: {
            type: Number,
            default: 0
        },
        excessRmes: {
            type: Number,
            default: 0
        },
        currency: {
            type: String,
            required: true
        },
        status: {
            type: String,
            required: true
        },
        method: {
            type: String,
            required: true
        },
        txnNumber: {
            type: String,
            required: true
        },
        employeeId: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        },
        paymentDate: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

PaymentLogSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Payment Log", PaymentLogSchema);
