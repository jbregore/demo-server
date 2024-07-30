const mongoose = require('mongoose');

const UserSchema = mongoose.Schema(
  {
    employeeId: {
      type: String,
      required: true
    },
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
    role: {
      type: String,
      enum: ['cashier', 'supervisor', 'it_admin', 'manager',],
      required: true
    },
    contactNumber: {
      type: String,
      required: true
    },
    username: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    isArchive: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
