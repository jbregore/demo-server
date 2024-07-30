const mongoose = require('mongoose');

const DemoOrganizationSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        user: {
            type: String,
            required: true
        },
        deviceId: {
            type: Number,
            required: true
        },
        apiKey: {
            type: String,
            required: true
        },
        date: {
            type: String,
            required: false
        },
        accessKey: {
            type: String,
            required: true
        },
        status: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('DemoOrganization', DemoOrganizationSchema);
