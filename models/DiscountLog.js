const mongoose = require("mongoose");
const moment = require('moment')

const DiscountLogSchema = mongoose.Schema(
    {
        discountLogId: {
            type: String,
            required: true
        },
        discount: {
            type: String,
            required: true
        },
        amount: {
            type: Number,
            required: true
        },
        poNumber: {
            type: String,
            default: ''
        },
        receiptLabel: {
            type: String,
            default: ''
        },
        percentageAmount: {
            type: Number,
            default: 0
        },
        txnNumber: {
            type: String,
            default: ''
        },
        forUpgrade: {
            type: String,
        },
        employeeId: {
            type: String,
            required: true
        },
        storeCode: {
            type: String,
            required: true
        },
        discountDate: {
            type: Date,
            required: true
        },
    },
    { timestamps: true }
);

DiscountLogSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Discount Log", DiscountLogSchema);
