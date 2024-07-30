const mongoose = require("mongoose");
const moment = require('moment')

const LoginLogSchema = mongoose.Schema(
    {
        loginId: {
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
        loginDate: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

LoginLogSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Login Log", LoginLogSchema);
