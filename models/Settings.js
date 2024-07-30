const mongoose = require('mongoose');
const { CustomPaymentMethodAdditionalFields } = require('./CustomPaymentMethod');

const PaymentMethodSchema = mongoose.Schema({
  id: { type: String, required: true },
  active: { type: Boolean, required: true },
  label: { type: String, required: true },
  title: { type: String, required: true },
  // Optional fields for custom payment methods
  ...CustomPaymentMethodAdditionalFields
});

const SettingsSchema = mongoose.Schema(
  {
    unitConfiguration: {
      type: {
        isConfigured:  { type: Boolean },
        startingDate: { type: String, required: true },
        storeCode: { type: String, required: true },
        warehouseCode: { type: String, required: true },
        printerName: { type: String, required: true },
        doublePrinting: { type: Boolean, required: true },
        printerWidth: {
          type: {
            id: { type: String, required: true, unique: true },
            label: { type: String, required: true },
            width: { type: Number, required: true }
          },
          required: true
        },
        nonVat: { type: Boolean, required: true },
        snMin: { type: String, required: true },
        headerVatReg: { type: String, required: true },
        headerAccr: { type: String, required: true },
        devMode: { type: Boolean, required: true },
        ecomm: { type: Boolean, required: true },
        mallAccr: { type: String, required: true },
        terminalNumber: { type: String, required: true },
        tenantId: { type: String },
        permit: { type: String, required: true },
        ptuDateIssued: { type: String, required: true },
        smSalesType: { type: String },
        smTransactionType: { type: String },
        mwcSalesTypeCode: { type: String },
        companyCode: { type: String },
        contractNumber: { type: String },
        contractName: { type: String },
        ayalaHost: { type: String },
        ayalaPort: { type: Number },
        ayalaUser: { type: String },
        ayalaPassword: { type: String },
        ayalaRootPath: { type: String },
        ayalaDomain: { type: String },
        robinsonsFTPHost: { type: String },
        robinsonsFTPUsername: { type: String },
        robinsonsFTPPassword: { type: String },
        robinsonsFTPRootPath: { type: String },
        icmSalesTypeCode: { type: String },
        aranetaMallCode: {type: String,},
        aranetaContractNumber: {type: String,},
        aranetaOutletNumber: {type: String,},
        aranetaSalesType: {type: String,},
        aranetaOpenField1: {type: String,},
        aranetaOpenField2: {type: String,},
        eviaSalesCode: { type: String },
        eviaStallCode: { type: String },
        eviaLocalSavePath: { type: String },
        eviaNetworkSavePath: { type: String }
      },
      required: true
    },
    birInformation: {
      type: {
        vatReg: { type: String, required: true },
        accr: { type: String, required: true },
        birVersion: { type: String },
        accrDateIssued: { type: String, required: true },
        taxCodeExempt: { type: String, required: true },
        taxCodeRegular: { type: String, required: true },
        taxCodeZeroRated: { type: String, required: true }
      },
      required: true
    },
    companyInformation: {
      type: {
        storeName: { type: String, required: true },
        companyName: { type: String, required: true },
        companyAddress1: { type: String, required: true },
        companyAddress2: { type: String, required: true },
        companyWebsiteLink: { type: String, required: true },
        companyContactNumber: {
          type: String,
          required: true,
          validator: function (v) {
            return /^\+?(63)?[0-9]{10}$/.test(v);
          },
          message: (props) => `${props.value} is not a valid Philippine phone number!`
        }
      },
      required: true
    },
    paymentMethod: {
      type: [PaymentMethodSchema],
      required: true
    },
    sqlIndexed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('settings', SettingsSchema);
