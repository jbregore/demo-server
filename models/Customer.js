const mongoose = require('mongoose');

const CustomerSchema = mongoose.Schema({
    firstname: {
        type: String,
        required: true
    },
    middlename: {
        type: String,
        required: true
    },
    lastname: {
        type: String,
        required: true
    },
    birthdate: {
        type: Date,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    contactNumber: {
        type: String,
        required: true
    },
    address: {
        type: String,
        required: true
    },
    status: {
        type: Boolean,
        required: true
    },
    isRemoved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('customer', CustomerSchema);