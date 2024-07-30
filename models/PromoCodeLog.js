const mongoose = require("mongoose");
const moment = require('moment')

const PromoCodeLogSchema = mongoose.Schema(
  {
    promoCodeLogId: {
      type: String,
      required: true
    },
    promoCode: {
      type: String,
      ref: 'inventoryCategory',
    },
    promoType: {
      type: String,
      required: true
    },
    value: {
      type: Number,
      required: true
    },
    discountType: {
      type: String,
      required: true
    },
  },
  { timestamps: true }
);

PromoCodeLogSchema.pre('save', function(next) {
  const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
  this.createdAt = new Date(`${date}T${time}Z`)
  this.updatedAt = new Date(`${date}T${time}Z`)
  next()
})  

module.exports = mongoose.model("PromoCodeLog", PromoCodeLogSchema);
