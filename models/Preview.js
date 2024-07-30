const mongoose = require('mongoose');
const moment = require('moment')

const PreviewSchema = new mongoose.Schema(
  {
    txnNumber: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    storeCode: {
      type: String,
      required: true
    },
    transactionDate: {
      type: Date,
      required: true
    },
    data: {
      type: Object,
      required: true
      }
    },
    { timestamps: true }
  );

  PreviewSchema.index({ 'data.cart.payments.siNumber': -1 }, { sparse: true });
  PreviewSchema.index({ 'data.cart.confirmOrders.orderId': -1 }, { sparse: true });
  PreviewSchema.index({ txnNumber: -1 });
  PreviewSchema.index({ storeCode: -1, type: -1, transactionDate: -1 });
  PreviewSchema.index(
    {
      storeCode: -1,
      type: -1,
      transactionDate: -1,
      'data.xReadData.txnAmounts': -1
    },
    { sparse: true }
  );
PreviewSchema.index({ storeCode: -1, transactionDate: -1 });
PreviewSchema.index({ storeCode: -1, transactionDate: -1, createdAt: -1 });
PreviewSchema.index({ type: -1 });
PreviewSchema.index({ transactionDate: -1 });

PreviewSchema.pre('save', function(next) {
  const [date, time] = moment().format('YYYY-MM-DD HH:mm:ss').split(' ')
  this.createdAt = new Date(`${date}T${time}Z`)
  this.updatedAt = new Date(`${date}T${time}Z`)
  next()
})  

module.exports = mongoose.model('preview', PreviewSchema);
