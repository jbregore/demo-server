const mongoose = require('mongoose');

const PaymentTypeSchema = mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('paymentType', PaymentTypeSchema);