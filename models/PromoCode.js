const mongoose = require("mongoose");
const moment = require('moment');

const PromoCodeSchema = mongoose.Schema(
  {
    promoCodeId: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true,
    },
    value: {
      type: Number,
      required: true,
    },
    promoName: {
      type: String,
      required: true,
      unique: true
    },
    itemDiscount: {
      type: Boolean,
      default: false,
    },
    transactionDiscount: {
      type: Boolean,
      default: false,
    },
    dateFrom: {
      type: String,
      default: ''
    },
    dateTo: {
      type: String,
      default: ''
    },
    timeFrom: {
      type: String,
      default: ''
    },
    timeTo: {
      type: String,
      default: ''
    },
    days: {
      type: [String],
      default: ''
    },

    usageLimit: {
      type: Number,
      default: 0
    },
    isArchive: {
      type: Boolean,
      default: false,
    },
    storeCode: {
      type: String,
      required: true
    },

    isRestricted: {
      type: Boolean,
      default: true,
    }

  },
  { timestamps: true }
);

PromoCodeSchema.path('promoName').validate({
  validator: async function (value) {
    const promoCode = await mongoose.models.PromoCode.findOne({ promoName: { $regex: new RegExp('^' + value + '$', 'i') } });
    return !promoCode;
  },
  message: 'Promo name already exists'
});

PromoCodeSchema.pre('save', function (next) {
  const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ');
  this.createdAt = new Date(`${date}T${time}Z`);
  this.updatedAt = new Date(`${date}T${time}Z`);
  next();
});

module.exports = mongoose.model("PromoCode", PromoCodeSchema);
