const mongoose = require("mongoose");
const moment = require('moment')

const ReadLogSchema = mongoose.Schema(
    {
        reportReadLogId: {
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
        type: {
            type: String,
            enum: [
                "x-read",
                "z-read"
            ]
        },
        readDate: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

ReadLogSchema.pre('save', function(next) {
    const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
    this.createdAt = new Date(`${date}T${time}Z`)
    this.updatedAt = new Date(`${date}T${time}Z`)
    next()
})  

module.exports = mongoose.model("Read Log", ReadLogSchema);
