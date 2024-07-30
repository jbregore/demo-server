const moment = require('moment');
const ssis = require('../config/db/ssis');
const backupDb = require('../config/db/backupDb');
const HttpError = require('../middleware/http-error');
const internetAvailable = require('internet-available');
const umbraSystemsHelper = require('../graphql/umbra-systems-helper');
// const Papa = require('papaparse');
const Counter = require('../models/Counter');
const Transaction = require('../models/Transaction');
const TransactionAmount = require('../models/TransactionAmount');
const SCPWDReport = require('../models/SCPWDReport');
const DiscountLog = require('../models/DiscountLog');
const PaymentLog = require('../models/PaymentLog');
const Order = require('../models/Order');
const PromoCode = require('../models/PromoCode');
const PromoCodeLog = require('../models/PromoCodeLog');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const {
  getTxnNumber,
  getSiNumber,
  generateNextActivityNumber
} = require('./common/transaction');
const { formatDate } = require('../services/cash-logs/common');
const ActivityLog = require('../models/ActivityLog');
const uniqid = require('uniqid');
const {
  printCheckoutReceipt,
  updateOrders,
  createPaymentLogs,
  createPosDiscountOrderLogs,
  createScPwdDiscountLogs,
  createPosDiscountItemLogs,
  createPosSCPWDReports,
  createPosDiscountTransactionLogs,
  createPromoCodeLogs
} = require('../services/checkout/checkoutService');
const Preview = require('../models/Preview');

async function generateNextOrderNumber() {
  return new Promise((resolve, reject) => {
    Counter.findOneAndUpdate(
      { _id: 'orderNumber' },
      { $inc: { seq: 1 } },
      { new: true }
    )
    .then(next => {
      if (!next) {
        return Counter.create({ _id: 'orderNumber', seq: 0 });
      }
      return next;
    })
    .then(result => {
      resolve(result.seq);
    })
    .catch(err => {
      reject(err);
    });
  });
}

// REMOVE ACTIVE CATEGORY AND CONVERT TO MONGODB

exports.getProductsByFreeItem = async (req, res, next) => {
  try {
    // const { category } = req.query;
    const products = await Product.find(
      {
        availability: true,
        // ...category != -1 && {
        //   category: category,
        // },
        price: 0
      },
      {
        _id: 1,
        itemName: '$name',
        productCode: 1,
        price: 1,
        description: 1
      },
      {
        sort: {
          name: 1
        }
      }
    );
    // console.log(products);

    return res.status(200).json({ data: products });
  } catch (err) {
    // console.error(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.getPromoCodes = async (req, res, next) => {
  const { promoType } = req.query;
  try {
    const promoCodeTypeFilter = {};

    switch (promoType) {
      case 'item':
        promoCodeTypeFilter.itemDiscount = true;
        break;
      case 'order':
        promoCodeTypeFilter.orderDiscount = true;
        break;
      case 'transaction':
        promoCodeTypeFilter.transactionDiscount = true;
        break;
      default:
        promoCodeTypeFilter.itemDiscount = true;
    }

    const today = new Date().toISOString().substring(0, 10);
    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5);

    const daysOfWeek = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDay = daysOfWeek[now.getDay()];

    const promoCodes = await PromoCode.find(
      {
        ...promoCodeTypeFilter,
        isArchive: false,
        $or: [
          { isRestricted:false  },
          {
            isRestricted: true,
            dateFrom: { $lte: today },
            dateTo: { $gte: today },
            timeFrom: { $lte: currentTime },
            timeTo: { $gte: currentTime },
            days: currentDay
          }
        ]
      },
      null,
      { sort: { createdAt: 1 } }
    );

    return res.status(200).json({ data: promoCodes });
  } catch (err) {
    const error = new HttpError('Something went wrong on getting promo codes', 500);
    return next(error);
  }
};

exports.createPromoCodeLogs = async (req, res, next) => {
  try {
    const { promoCodeLogId, promoCodeId, promoType, value, discountType } = req.body;

    const newPromoCodeLog = new PromoCodeLog({
      promoCodeLogId,
      promoCode: promoCodeId,
      promoType,
      value,
      discountType
    });

    await newPromoCodeLog.save();
    return res.status(200).json({ message: 'Successfully saved promo code log' });
  } catch (err) {
    const error = new HttpError('Something went wrong on creating promo code logs', 500);
    return next(error);
  }
};

exports.updateOrderSuspend = async (req, res, next) => {
  try {
    const { orderId } = req.body;
    await Order.findOneAndUpdate(
      { orderId },
      {
        status: 'suspend'
      }
    );

    return res.status(200).json({ message: 'Successfully suspended order.' });
  } catch (err) {
    const error = new HttpError('Something went wrong on updating order to suspend', 500);
    return next(error);
  }
};

exports.updateProductCancelled = async (req, res, next) => {
  try {
    const { poNumber, productCode, cancelOrder, orderId } = req.body;

    await Order.findOneAndUpdate(
      {
        'products.poNumber': poNumber,
        'products.productCode': productCode,
        'products.status': 'for payment'
      },
      { $set: { 'products.$[product].status': 'cancelled' } },
      {
        arrayFilters: [
          {
            'product.poNumber': poNumber,
            'product.productCode': productCode,
            'product.status': 'for payment'
          }
        ]
      }
    );

    // If there is only 1 item left to cancel, then cancel the order
    if (cancelOrder) {
      await Order.findOneAndUpdate({ orderId }, { status: 'cancelled' });
    }
    return res.status(200).json({ mesasage: 'test' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Failed to cancel item. Please try again', 500);
    return next(error);
  }
};

exports.updateOrderPaid = async (req, res, next) => {
  try {
    const { orderId, products, transactionDate, total, txnNumber, siNumber } = req.body;

    // Get cancelled transactions and add to products array
    const cancelledProducts = await Order.aggregate([
      {
        $match: {
          orderId: orderId
        }
      },
      {
        $unwind: {
          path: '$products'
        }
      },
      {
        $match: {
          'products.status': 'cancelled'
        }
      },
      {
        $group: {
          _id: '_id',
          products: {
            $push: '$products'
          }
        }
      }
    ]);

    console.log(`Cancelled Products is `, cancelledProducts);

    const cancelledProductsList = cancelledProducts.length > 0 ? cancelledProducts[0].products : [];

    await Order.findOneAndUpdate(
      { orderId },
      {
        products: [...cancelledProductsList, ...products],
        status: 'paid',
        paymentDate: new Date(`${transactionDate}T${moment().format('HH:mm:ss')}Z`),
        total,
        txnNumber,
        siNumber
      }
    );

    return res.status(200).json({ message: 'Successfully paid order.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createPosDiscountItemLog = async (req, res, next) => {
  const {
    discountLogId,
    discount,
    amount,
    poNumber,
    receiptLabel,
    percentageAmount,
    txnNumber,
    isUpgrade,
    cashierId,
    storeCode,
    discountDate
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(discountDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newDiscountLog = new DiscountLog({
      discountLogId,
      discount,
      amount,
      poNumber,
      receiptLabel,
      percentageAmount,
      txnNumber,
      forUpgrade: isUpgrade,
      employeeId: cashierId,
      storeCode,
      discountDate: new Date(`${txnDate}T${txnTime}Z`)
    });

    await newDiscountLog.save();
    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createPosDiscountOrderLog = async (req, res, next) => {
  const {
    discountLogId,
    discount,
    amount,
    orderId,
    isUpgrade,
    cashierId,
    storeCode,
    discountDate
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(discountDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newDiscountLog = new DiscountLog({
      discountLogId,
      discount,
      amount,
      orderId,
      forUpgrade: isUpgrade,
      cashierId,
      storeCode,
      discountDate: new Date(`${txnDate}T${txnTime}Z`)
    });
    await newDiscountLog.save();

    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createPosDiscountTransactionLog = async (req, res, next) => {
  const {
    discountLogId,
    discount,
    amount,
    txnNumber,
    receiptLabel,
    percentageAmount,
    isUpgrade,
    cashierId,
    storeCode,
    discountDate
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(discountDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newDiscountLog = new DiscountLog({
      discountLogId,
      discount,
      amount,
      receiptLabel,
      percentageAmount,
      txnNumber,
      forUpgrade: isUpgrade,
      employeeId: cashierId,
      storeCode,
      discountDate: new Date(`${txnDate}T${txnTime}Z`)
    });
    await newDiscountLog.save();
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createOrder = async (req, res, next) => {
  const { branchCode, cashierId, product, transactionDate } = req.body;

  try {
    const orderDate = `${transactionDate.split(' ')[0]} ${moment().format('HH:mm:ss')}`;
    const [txnDate, txnTime] = orderDate.split(' ');
    const orderNumber = await generateNextOrderNumber();

    const orderId = `${orderNumber}`.padStart(10, '0');
    const newOrder = new Order({
      orderId: `${branchCode}-${orderId}`,
      products: [
        {
          productName: product.name,
          productCode: product.productCode,
          categoryName: product.category.name,
          price: product.price,
          quantity: 1,
          poNumber:
            `${branchCode}${moment().format('yyyyMMDDHHmmss')}` + `${orderNumber}`.padStart(3, '0'),
          category: new mongoose.Types.ObjectId(product.category._id),
          isVatable: product.vatable
        }
      ],
      orderDate: new Date(`${txnDate}T${txnTime}Z`),
      status: 'for payment',
      employeeId: cashierId,
      storeCode: branchCode
    });

    const result = await newOrder.save();

    return res.status(200).json({ data: result });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.addOrderItem = async (req, res, next) => {
  const { orderId, productName, productCode, price, quantity, branchCode, category, categoryName, vatable } =
    req.body;

  try {
    const orderNumber = parseInt(orderId.split('-')[1]);
    const newProduct = {
      productName,
      productCode,
      price,
      quantity,
      categoryName,
      poNumber:
        `${branchCode}${moment().format('yyyyMMDDHHmmss')}` + `${orderNumber}`.padStart(3, '0'),
      status: 'for payment',
      category: new mongoose.Types.ObjectId(category),
      isVatable: vatable
    };

    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      {
        $push: {
          products: {
            ...newProduct
          }
        }
      },
      { new: true }
    );

    const insertedProduct = updatedOrder.products[updatedOrder.products.length - 1];

    return res.status(200).json({ data: insertedProduct });
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      'Something went wrong on adding item to order, please try again.',
      500
    );
    return next(error);
  }
};

exports.getForPaymentOrders = async (req, res, next) => {
  const { transactionDate } = req.params;

  try {
    const [txnDateStart, txnTimeStart] = moment(transactionDate)
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');
    const [txnDateEnd, txnTimeEnd] = moment(transactionDate)
      .endOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');

    const forPaymentOrders = await Order.aggregate([
      {
        $match: {
          status: { $in: ['for payment', 'suspend'] },
          orderDate: {
            $gte: new Date(`${txnDateStart}T${txnTimeStart}Z`),
            $lte: new Date(`${txnDateEnd}T${txnTimeEnd}Z`)
          }
        }
      },
      {
        $unwind: {
          path: '$products'
        }
      },
      {
        $match: {
          'products.status': 'for payment'
        }
      },
      {
        $group: {
          _id: '$_id',
          orderId: {
            $first: '$orderId'
          },
          products: {
            $push: '$products'
          },
          firstName: {
            $first: '$firstName'
          },
          lastName: {
            $first: '$lastName'
          },
          status: {
            $first: '$status'
          },
          orderDate: {
            $first: '$orderDate'
          },
          paymentMethods: {
            $first: '$paymentMethods'
          },
          employeeId: {
            $first: '$employeeId'
          },
          storeCode: {
            $first: '$storeCode'
          }
        }
      }
    ]);

    return res.status(200).json({ data: forPaymentOrders });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong on getting for payment orders.');
    return next(error);
  }
};

exports.createPosPaymentLog = async (req, res, next) => {
  const {
    paymentLogId,
    customPaymentKey,
    type,
    amount,
    excessGcType,
    excessGcAmount,
    excessCash,
    excessRmes,
    currency,
    status,
    method,
    txnNumber,
    cashierId,
    storeCode,
    paymentDate
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(paymentDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newPaymentLog = new PaymentLog({
      paymentLogId,
      customPaymentKey,
      type,
      amount,
      excessGiftCardType: excessGcType,
      excessGiftCardAmount: excessGcAmount,
      excessCash,
      excessRmes,
      currency,
      status,
      method,
      txnNumber,
      employeeId: cashierId,
      storeCode,
      paymentDate: new Date(`${txnDate}T${txnTime}Z`)
    });
    await newPaymentLog.save();

    await Order.findOneAndUpdate(
      { txnNumber: txnNumber },
      { $push: { paymentMethods: newPaymentLog._id } },
      { new: true }
    );

    return res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createPosTransaction = async (req, res, next) => {
  const { amount, cashierId, storeCode, type, transactionDate, returnSiNumber, refundSiNumber } =
    req.body;

  /*
   * Queries to return the transaction number, void number, and si number
   */
  const getTxnNumber = () => {
    return new Promise((resolve, reject) => {
      Counter.findOne({})
        .then(result => {
          const txnNumber = `${result.seq + 1}`.padStart(16, '0');
          resolve(txnNumber);
        })
        .catch(err => {
          console.log(err);
          reject('Failed to count users activity logs, please try again.');
        });
    });
  };
  

  const getSiNumber = () => {
    return new Promise((resolve, reject) => {
      Transaction.find({ storeCode, type: 'regular' })
        .then(result => {
          let siNumber;
          switch (type) {
            case 'regular':
              siNumber = `${result.length + 1}`.padStart(16, '0');
              break;
            case 'return':
              siNumber = returnSiNumber;
              break;
            case 'refund':
              siNumber = refundSiNumber;
              break;
            default:
              siNumber = '';
              break;
          }
          resolve(siNumber);
        })
        .catch(() => {
          reject('Failed to count transactions, please try again.');
        });
    });
  };
  

  const getVoidNumber = () => {
    return new Promise((resolve, reject) => {
      Transaction.find({ storeCode, type: 'void' })
        .then(result => {
          let voidNumber = '';
          if (type === 'void') {
            voidNumber = `${result.length + 1}`.padStart(16, '0');
          }
          resolve(voidNumber);
        })
        .catch(() => {
          reject('Failed to count void, please try again.');
        });
    });
  };
  

  const createTxn = (txnNumber, voidNumber, siNumber) => {
    return new Promise((resolve, reject) => {
      const [txnDate, txnTime] = moment(transactionDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
      const newTransaction = new Transaction({
        amount,
        employeeId: cashierId,
        storeCode,
        type,
        txnNumber,
        siNumber,
        voidNumber,
        transactionDate: new Date(`${txnDate}T${txnTime}Z`)
      });
  
      newTransaction.save()
        .then(() => {
          resolve();
        })
        .catch(() => {
          reject('Failed to create transaction, please try again.');
        });
    });
  };
  

  try {
    const [txnNumber, siNumber, voidNumber] = await Promise.all([
      getTxnNumber(),
      getSiNumber(),
      getVoidNumber()
    ]);

    await createTxn(txnNumber, voidNumber, siNumber);
    return res.status(200).json({ siNumber, txnNumber, voidNumber });
  } catch (err) {
    const error = new HttpError(err, 500);
    return next(error);
  }
};

exports.createPosTxnAmount = async (req, res, next) => {
  const {
    txnNumber,
    vatableSale,
    vatAmount,
    vatExempt,
    vatZeroRated,
    nonVatable,
    totalAmount,
    cashierId,
    storeCode,
    transactionDate
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(transactionDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newTxnAmount = new TransactionAmount({
      txnNumber,
      vatableSale,
      vatAmount,
      vatExempt,
      vatZeroRated,
      nonVatable,
      totalAmount,
      employeeId: cashierId,
      storeCode,
      transactionDate: new Date(`${txnDate}T${txnTime}Z`)
    });

    await newTxnAmount.save();
    res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.createPosScPwdReport = async (req, res, next) => {
  const {
    scPwdReportId,
    firstname,
    lastname,
    idNumber,
    type,
    grossSales,
    discountAmount,
    txnNumber,
    reportDate,
    storeCode
  } = req.body;

  try {
    const [txnDate, txnTime] = moment(reportDate).format('YYYY-MM-DD HH:mm:ss').split(' ');
    const newScPwdReport = new SCPWDReport({
      scPwdReportId,
      firstName: firstname,
      lastName: lastname,
      idNumber,
      type,
      grossSales,
      discountAmount,
      txnNumber,
      storeCode,
      reportDate: new Date(`${txnDate}T${txnTime}Z`)
    });

    await newScPwdReport.save();
    res.status(200).json({ data: 'OK' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

// Old Controllers

// REMOVE ACTIVE CATEGORY AND CONVERT TO MONGODB
exports.updateLoyaltyPoints = async (req, res, next) => {
  const { customerId, newPoints } = req.body;

  const connection = ssis();

  try {
    internetAvailable({
      // Provide maximum execution time for the verification
      timeout: 5000,
      // If it tries 5 times and it fails, then it will throw no internet
      retries: 2
    })
      .then(() => {
        const backupConnection = backupDb();
        backupConnection
          .promise()
          .query(
            `
            UPDATE
              _pos_loyalty_points
            SET
              loyalty_points = ${newPoints}
            WHERE
              customer_id = '${customerId}'
          `
          )
          .catch(() => backupConnection.end())
          .then(() => backupConnection.end());
      })
      .catch(() => console.log('No internet'));

    connection.query(
      `
        UPDATE
          _pos_loyalty_points
        SET
          loyalty_points = ${newPoints}
        WHERE
          customer_id = '${customerId}'
      `,
      function (err, result) {
        if (err) {
          const error = new HttpError(
            'Failed to update pos loyalty points, please try again.',
            500
          );
          connection.end();

          return next(error);
        } else {
          connection.end();
          res.status(200).json({ data: result });
        }
      }
    );
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    connection.end();

    return next(error);
  }
};

//Checkout
exports.checkout = async (req, res, next) => {
  let txnNumberResponse = '';
  let siNumberResponse = '';
  const session = await mongoose.startSession();

  try {
    let umsysPosTxnPayload = {};
    await session.withTransaction(async () => {
      const {
        posTxnPayload,
        posTxnAmountPayload,
        activityPayload,
        previewPayload,
        printPayload,
        ordersToUpdatePayload,
        posDiscountOrderLogsPayload,
        posDiscountItemLogsPayload,
        posSCPWDReportPayload,
        paymentLogsToInsertPayload,
        scPwdDiscountsPayload,
        posDiscountsTransactionPayload,
        promoCodePayload
      } = req.body;

      //pos-txn
      const [txnNumber, siNumber] = await Promise.all([
        getTxnNumber(),
        getSiNumber(posTxnPayload.type)
      ]);

      txnNumberResponse = txnNumber;
      siNumberResponse = siNumber;

      const { date: posTxnDate, time: posTxnTime } = formatDate(posTxnPayload.transactionDate);
      await Transaction.create(
        [
          {
            amount: posTxnPayload.amount,
            employeeId: posTxnPayload.cashierId,
            storeCode: posTxnPayload.storeCode,
            type: posTxnPayload.type,
            txnNumber,
            siNumber,
            transactionDate: new Date(`${posTxnDate}T${posTxnTime}Z`)
          }
        ],
        { session }
      );

      //pos-txn-amount
      const { date: posTxnAmountDate, time: posTxnAmountTime } = formatDate(
        posTxnAmountPayload.transactionDate
      );
      await TransactionAmount.create(
        [
          {
            txnNumber,
            vatableSale: posTxnAmountPayload.vatableSale,
            vatAmount: posTxnAmountPayload.vatAmount,
            vatExempt: posTxnAmountPayload.vatExempt,
            vatZeroRated: posTxnAmountPayload.vatZeroRated,
            nonVatable: posTxnAmountPayload.nonVatable,
            totalAmount: posTxnAmountPayload.totalAmount,
            employeeId: posTxnAmountPayload.cashierId,
            storeCode: posTxnAmountPayload.storeCode,
            transactionDate: new Date(`${posTxnAmountDate}T${posTxnAmountTime}Z`)
          }
        ],
        { session }
      );

      //activity-log
      const { date: activityDate, time: activityTime } = formatDate(activityPayload.activityDate);
      await ActivityLog.create(
        [
          {
            activityLogId: uniqid(activityPayload.storeCode),
            transactionId: await generateNextActivityNumber(),
            firstName: activityPayload.firstname,
            lastName: activityPayload.lastname,
            employeeId: activityPayload.employeeId,
            activity: activityPayload.activity,
            description: `${activityPayload.description.user.firstname} ${activityPayload.description.user.lastname} has successfully checked out a order with an Transaction Number: ${txnNumber} with total amount of ${activityPayload.description.total}.`,
            action: activityPayload.action,
            storeCode: activityPayload.storeCode,
            activityDate: new Date(`${activityDate}T${activityTime}Z`)
          }
        ],
        { session }
      );

      //create preview
      const { date: previewDate, time: previewTime } = formatDate(previewPayload.transactionDate);

      const previewSnapshot = {
        txnNumber: txnNumber,
        type: previewPayload.type,
        storeCode: previewPayload.storeCode,
        transactionDate: new Date(`${previewDate}T${previewTime}Z`),
        data: {
          cart: {
            ...previewPayload.data.cart,
            txnNumber: txnNumber,
            siNumber: siNumber
          },
          cashier: previewPayload.data.cashier
        }
      };
      
      await Preview.create(
        [previewSnapshot],
        { session }
      );

      umsysPosTxnPayload = {
        txnNumber,
        type: previewSnapshot.type,
        transactionDate: moment(previewPayload.transactionDate).format('YYYY-MM-DD HH:mm:ss'),
        realTimeDate: moment().format('YYYY-MM-DD HH:mm:ss'),
        siNumber,
        amount: roundUpAmount(previewPayload.data.cart.amounts.noPayment),
        productSales: umbraSystemsHelper.parseProducts(previewSnapshot),
        preview: JSON.stringify(previewSnapshot)
      };

      //print
      await printCheckoutReceipt(printPayload, { siNumber, txnNumber });

      //update orders
      await updateOrders(ordersToUpdatePayload[0], session, { txnNumber, siNumber });

      //pos-discount order
      await createPosDiscountOrderLogs(posDiscountOrderLogsPayload, session);

      //pos-discount order
      await createPosDiscountItemLogs(posDiscountItemLogsPayload, session, { txnNumber });

      //pos-discount transaction
      await createPosDiscountTransactionLogs(posDiscountsTransactionPayload, session, {
        txnNumber
      });

      //sc-pwd report
      await createPosSCPWDReports(posSCPWDReportPayload, session, { txnNumber });

      //insert payment logs & update order
      const totalPayment = previewPayload.data.cart.amounts.noPayment
      const cashChange = previewPayload.data.cart.amounts.cashChange
      await createPaymentLogs({totalPayment, cashChange}, paymentLogsToInsertPayload, session, { txnNumber });

      //insert sc-pwd discount logs
      await createScPwdDiscountLogs(scPwdDiscountsPayload, session, { txnNumber });

      //insert promo code logs
      await createPromoCodeLogs(promoCodePayload, session);
    });

    // send txn to umbra systems
    const { apiKey, deviceId } = req.body.umbraSystemsPayload;
    umsysPosTxnPayload.posDeviceId = deviceId;
    umbraSystemsHelper.sendPosTransaction(
      umsysPosTxnPayload,
      { apiKey }
    );

    return res.status(200).json({
      message: 'Checkout success',
      txnNumber: txnNumberResponse,
      siNumber: siNumberResponse
    });
  } catch (err) {
    console.log(err);
    if (err.statusCode == 400) {
      return res.status(400).json({
        message: err.message
      });
    }
    const error = new HttpError('Something went wrong. Please try again.');
    return next(error);
  } finally {
    session.endSession();
  }
};

const roundUpAmount = (num) => {
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return parseFloat(num);
};