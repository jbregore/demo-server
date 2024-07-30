const mongoose = require('mongoose');

const CustomPaymentMethodPropertiesSchema = mongoose.Schema({
  amount: { type: Number, required: true },
  isFixedAmount: { type: Boolean, required: true },
  tenderCode: { type: String, required: true },
  tenderType: { type: String, required: true },
  tenderDesc: { type: String, required: true }
});

const CustomPaymentMethodInputFieldSchema = mongoose.Schema({
  label: { type: String, required: true },
  required: { type: Boolean, required: true },
  type: { type: String, required: true }
});

// Additional fields to the PaymentMethodSchema that follows the PosPaymentMethod structure from Umbra Systems API
const CustomPaymentMethodAdditionalFields = {
  __typename: { type: String, required: false },
  key: { type: String, required: false },
  type: { type: String, required: false },
  method: { type: String, required: false },
  properties: {
    type: CustomPaymentMethodPropertiesSchema,
    required: false
  },
  inputFields: {
    type: [CustomPaymentMethodInputFieldSchema],
    required: false
  }
}

module.exports = {
    CustomPaymentMethodAdditionalFields
}