const UmbraSystemsReport = require('../models/UmbraSystemsReport');
const { createApolloClient } = require('./apollo-client');
const {
  CREATE_POS_PRODUCT_SALES_MUTATION,
  CREATE_POS_GRAND_ACCUMULATED_SALES_MUTATION,
  CREATE_POS_TRANSACTION_MUTATION
} = require('./mutations');
const { computeSpecsPrice } = require('../utils/cart.util');

const umbraSystemsHelper = {
  parseProducts: (preview) => {
    let multiplier = 1;

    // If the transaction is a void, refund, or return,
    // we need to multiply the quantity, price, and total by -1
    if (['void', 'refund', 'return'].includes(preview.type)) {
      multiplier = -1;
    }

    const cart = preview.data.cart;
    const products = [];
    for (const order of preview.data.cart.confirmOrders) {
      for (const product of order.products) {
        const newPrice = computeSpecsPrice(cart, order, product, true)

        products.push({
          category: product.categoryName,
          productCode: product.productCode,
          productName: product.productName,
          quantity: multiplier * product.quantity,
          price: roundUpAmount(multiplier * newPrice),
          total: roundUpAmount(multiplier * (product.quantity * newPrice))
        });
      }
    }

    return products;
  },

  sendPosTransaction: async (posTransaction, options = {}) => {
    if (options.apiKey) {
      const apolloClient = createApolloClient(options.apiKey);
      try {
        await apolloClient.mutate({
          mutation: CREATE_POS_TRANSACTION_MUTATION,
          variables: {
            posDeviceId: posTransaction.posDeviceId,
            posTransaction
          }
        });
      } catch (err) {
        console.log('Error sending transaction data to Umbra Systems. Enqueueing.', err);
        await UmbraSystemsReport.create({
          type: 'pos_transaction',
          posDeviceId: posTransaction.posDeviceId,
          data: posTransaction
        });
      }
    }
  },
  sendPosProductSales: async (posProductSales = [], options = {}) => {
    if (options.deviceId && options.apiKey) {
      const apolloClient = createApolloClient(options.apiKey);
      try {
        await apolloClient.mutate({
          mutation: CREATE_POS_PRODUCT_SALES_MUTATION,
          variables: {
            posDeviceId: options.deviceId,
            posProductSales
          }
        });
      } catch (err) {
        console.log(err);
      }
    }
  },
  sendPosGrandAccumulatedSales: async (posGrandAccumulatedSales = {}, options = {}) => {
    if (options.deviceId && options.apiKey) {
      const apolloClient = createApolloClient(options.apiKey);
      try {
        await apolloClient.mutate({
          mutation: CREATE_POS_GRAND_ACCUMULATED_SALES_MUTATION,
          variables: {
            posDeviceId: options.deviceId,
            posGrandAccumulatedSales: {
              ...posGrandAccumulatedSales,
              posDeviceId: parseInt(options.deviceId)
            }
          }
        });
      } catch (err) {
        console.log(err);
      }
    }
  }
};

const roundUpAmount = (num) => {
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return parseFloat(num);
};

module.exports = umbraSystemsHelper;
