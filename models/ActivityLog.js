const mongoose = require("mongoose");
const moment = require('moment')

const ActivitySchema = mongoose.Schema(
  {
    activityLogId: {
      type: String,
      required: true
    },
    transactionId: {
      type: Number,
      default: 0,
      required: true
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    employeeId: {
      type: String,
      required: true,
    },
    storeCode: {
      type: String,
      required: true,
    },
    activity: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    activityDate: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

ActivitySchema.pre('save', function(next) {
  const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
  this.createdAt = new Date(`${date}T${time}Z`)
  this.updatedAt = new Date(`${date}T${time}Z`)
  next()
})  

module.exports = mongoose.model(
  "Activity Log",
  ActivitySchema,
  "activity logs"
);
