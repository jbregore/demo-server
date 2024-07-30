const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const uniqid = require('uniqid');
const mongoose = require('mongoose');
const HttpError = require('../middleware/http-error');
const moment = require('moment');
const { capitalCase } = require('text-case');
const umbraSystemsHelper = require('../graphql/umbra-systems-helper');

const {
  getSiNumber,
  getVoidNumber,
  getTxnNumber,
  generateNextActivityNumber
} = require('./common/transaction');

// Models
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const PaymentLog = require('../models/PaymentLog');
const Preview = require('../models/Preview');
const ActivityLog = require('../models/ActivityLog');
const { simplePaginate } = require('../services/simplePaginate');
const { SettingsCategoryEnum } = require('./common/settingsData');

const roundUpAmount = (num) => {
  // num = Math.round(num * 100) / 100;
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};

exports.getFilteredTransactions = async (req, res, next) => {
  const {
    page = 1,
    pageSize = 5,
    search = '',
    sortBy = 'paymentDate',
    sortOrder = 'desc'
  } = req.query;
  const { storeCode } = req.params;
  const { from, to, status } = req.query;

  const [fromTxnDate, fromTxnTime] = moment(from)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [toTxnDate, toTxnTime] = moment(to).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  let query = { storeCode };
  if (search) {
    query = { siNumber: { $regex: new RegExp(search, 'i') } };
  }

  if (from) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`)
    };
  }

  if (to) {
    query.paymentDate = {
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (from && to) {
    query.paymentDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };
  }

  if (status && status !== 'All') {
    query.status = status;
  }

  const { paginationMeta, limit, skip } = await simplePaginate(Order, { page, pageSize }, query);

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

  try {
    const orders = await Order.aggregate([
      { $match: query },
      { $sort: sortOptions },
      { $skip: skip },
      { $limit: limit }
    ]);

    const [filteredOrders] = await Order.aggregate([
      {
        $match: {
          ...query,
          status: 'paid'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: '$total'
          }
        }
      }
    ]);

    return res.status(200).json({
      meta: paginationMeta,
      data: orders,
      totalAmount: !filteredOrders ? 0 : filteredOrders.totalAmount
    });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

exports.updateOrderStatus = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    const {
      remarks,
      txnNumber,
      siNumber,
      action,
      cashierId,
      storeCode,
      refundSiNumber,
      returnSiNumber,
      amount,
      transactionDate,
      firstName,
      lastName,
      umbraSystemsPayload
    } = req.body;

    const [date, time] = transactionDate.split(' ');

    session.startTransaction();
    console.log(`TXN Number is `, txnNumber);

    // Change order status to void/refund/return
    await Order.findOneAndUpdate({ txnNumber }, { status: action }, { session });
    await Order.findOneAndUpdate(
      {
        txnNumber
      },
      {
        $set: {
          'products.$[elem].status': action
        }
      },
      {
        arrayFilters: [{ 'elem.status': { $ne: 'cancelled' } }],
        session
      }
    );

    // Change payment log status to void/refund/return
    await PaymentLog.updateMany({ txnNumber }, { status: action }, { session });

    // Get original regular transaction
    const origTxn = await Preview.findOne({ txnNumber });
    console.log(`origTxn is `, origTxn);

    // Get all details for transaction
    const [voidNumber, newSiNumber, newTxnNumber] = await Promise.all([
      getVoidNumber(action),
      getSiNumber(action, returnSiNumber, refundSiNumber),
      getTxnNumber()
    ]);

    // Insert a void/refund/return transaction to transactions table
    await Transaction.create(
      [
        {
          amount,
          employeeId: cashierId,
          storeCode,
          type: action,
          txnNumber: newTxnNumber,
          siNumber: newSiNumber,
          voidNumber,
          transactionDate: new Date(`${date}T${time}Z`)
        }
      ],
      { session }
    );

    // Insert to activity logs
    await ActivityLog.create(
      [
        {
          activityLogId: uniqid(storeCode),
          transactionId: await generateNextActivityNumber(),
          firstName,
          lastName,
          employeeId: cashierId,
          activity: 'Transaction',
          description: `${capitalCase(firstName)} ${capitalCase(
            lastName
          )} has ${action}ed an item with SI Number: ${siNumber} and amounting of ${fCurrency(
            'P',
            roundUpAmount(amount)
          )}.
      ${action.charAt(0).toUpperCase() + action.slice(1)}ed Item
      ${transactionDate}
      `,
          action,
          storeCode,
          activityDate: new Date(`${date}T${time}Z`)
        }
      ],
      { session }
    );

    let updatedData = origTxn.data;

    if (action === 'void') {
      updatedData = {
        ...origTxn.data,
        cart: {
          ...origTxn.data.cart,
          remarks: remarks,
          voidNumber: voidNumber,
          newTxnNumber: newTxnNumber
        }
      };
    } else if (action === 'refund' || action === 'return') {
      updatedData = {
        ...origTxn.data,
        cart: {
          ...origTxn.data.cart,
          remarks: remarks,
          newTxnNumber: newTxnNumber,
          newSiNumber: newSiNumber
        }
      };

      if (action === 'return') {
        updatedData.cart.returnDate = `${moment(new Date()).format('YYYY-MM-DD HH:mm:ss')}`;      }
    }

    // Insert a void/refund/return preview collection
    const previewSnapshot = {
      txnNumber: newTxnNumber,
      type: action,
      storeCode,
      transactionDate: new Date(`${date}T${time}Z`),
      data: updatedData
    };
    await Preview.create(
      [previewSnapshot],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    // send txn to umbra systems
    const { apiKey, deviceId } = umbraSystemsPayload;
    let umsysPosTxnPayload = {
      posDeviceId: deviceId,
      txnNumber: newTxnNumber,
      type: previewSnapshot.type,
      transactionDate: moment(transactionDate).format('YYYY-MM-DD HH:mm:ss'),
      realTimeDate: moment().format('YYYY-MM-DD HH:mm:ss'),
      siNumber: newSiNumber || undefined,
      voidNumber: voidNumber || undefined,
      origTxnNumber: txnNumber,
      amount: -1 * roundUpAmount(previewSnapshot.data.cart.amounts.noPayment),
      productSales: umbraSystemsHelper.parseProducts(previewSnapshot),
      preview: JSON.stringify(previewSnapshot)
    };
    umbraSystemsHelper.sendPosTransaction(
      umsysPosTxnPayload,
      { apiKey }
    );

    return res.status(200).json({ message: 'Successfully updated status', data: updatedData });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong. Please try again.');
    session.abortTransaction();
    session.endSession();
    return next(error);
  }
};

exports.updateStatusToCancelled = async (req, res, next) => {
  const { id } = req.body;

  try {
    const updatedOrder = await Order.updateOne(
      { 'products.poNumber': `${id}` },
      {
        $set: {
          // 'products.$.status': 'cancelled',
          status: 'cancelled' // Assuming you also want to update the overall order status to cancelled
        }
      }
    );
    res.status(200).json({ data: updatedOrder });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);

    return next(error);
  }
};

exports.updateStatusToRefund = async (req, res, next) => {
  const { orderId } = req.body;

  try {
    const updatedOrder = await Order.updateOne(
      { orderId },
      {
        $set: {
          status: 'returned'
        }
      }
    );
    if (!updatedOrder)
      return next(new HttpError('Failed to update orders specs status, please try again.', 500));
    res.status(200).json({ data: updatedOrder });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);

    return next(error);
  }
};

exports.getReturnedItem = async (req, res, next) => {
  const { siNumber, storeCode } = req.query;

  // check first if siNumber already used for payment
  let redemptionUsed;
  try {
    redemptionUsed = await Preview.findOne({
      'data.cart.payments': {
        $elemMatch: {
          siNumber
        }
      }
    });
  } catch (err) {
    console.log("err ", err)
  }

  if (redemptionUsed) {
    return res.status(422).json({ message: 'Si Number already used.' });
  }

  let query = { siNumber, storeCode, type: 'return' };

  try {
    const result = await Transaction.findOne(query, {
      amount: 1,
      transactionDate: 1
    });

    return res.status(200).json({ data: result });
  } catch (err) {
    console.log('err ', err);
    return res.status(400).json({ message: err.message });
  }
};

exports.printVoidReceipt = async (req, res, next) => {
  if (!req.body) {
    const error = new HttpError('No content to print.', 422);
    return next(error);
  }
  // const { cart, cashier, isReprint } = req.body;
  let { apiData, settings } = req.body;
  const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

  // apiData = JSON.parse(apiData);
  // settings = JSON.parse(settings);

  const { cart, cashier, isReprint } = apiData;

  console.log('CART', cart);

  let printer = new ThermalPrinter({
    type: Types.EPSON,
    interface: `//localhost/${settings[SettingsCategoryEnum.UnitConfig].printerName}`,
    width: '33px',
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: true,
    lineCharacter: '-'
  });

  const roundUpAmount = (num) => {
    // num = Math.round(num * 100) / 100;
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.UnitConfig].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '')
  printer.println(
    cart.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
  printer.newLine();
  printer.println('VOID');
  isReprint && printer.println('(REPRINT)');

  let isScPwd = false;
  let scPwdIdNumber = '';
  let type = '';

  cart.discounts
    .filter(
      (x) =>
        x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
    )
    .forEach((discount) => {
      isScPwd = true;
      scPwdIdNumber = discount.idNumber;
      type = discount.prefix;
    });
  cart.confirmOrders.forEach((order) => {
    order.products.forEach((product) => {
      if (product.discounts) {
        product.discounts
          .filter(
            (x) =>
              x.prefix === 'SCD' ||
              x.prefix === 'PWD' ||
              x.prefix === 'PNSTMD' ||
              (x.prefix === 'VAT' && x.prefix === 'PACKAGEDISCOUNT') ||
              x.prefix === 'VAT'
          )
          .forEach((discount) => {
            isScPwd = true;
            scPwdIdNumber = discount.idNumber;
            type = discount.prefix;
          });
      }
    });
  });

  let isVatZR = false;
  let vatZrRepresentative = '';
  let vatZrCert = '';

  cart.discounts
    .filter((x) => x.prefix === 'VATZR')
    .forEach((discount) => {
      isVatZR = true;
      vatZrRepresentative = discount.idNumber;
      vatZrCert = discount.pecaCertNo;
    });

  cart.confirmOrders.forEach((order) => {
    order.products.forEach((product) => {
      if (product.discounts) {
        product.discounts
          .filter((x) => x.prefix === 'VATZR')
          .forEach((discount) => {
            isVatZR = true;
            vatZrRepresentative = discount.idNumber;
            vatZrCert = discount.pecaCertNo;
          });
      }
    });
  });

  printer.alignLeft();

  cart.confirmOrders.forEach((order) => {
    printer.newLine();

    if (isVatZR) {
      printer.println(
        `Customer: ${
          isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
        } `
      );
    } else if (isScPwd) {
      printer.println(
        `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
      );
    } else {
      const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
      printer.println(
        `Customer: ${
          notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
        }`
      );
    }

    printer.println('Address:');

    // if (order.discounts) {
    //   if (
    //     order.discounts.filter(
    //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
    //     ).length > 0
    //   ) {
    //     isScPwd = true;
    //   }
    // }

    if (isScPwd) {
      if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
        printer.println('SC/PWD TIN:');
      }

      printer.println(
        `${
          type === 'SCD' ||
          type === 'SCD-5%' ||
          type === 'PWD' ||
          (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
          type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
        } ${scPwdIdNumber}`
      );
      printer.newLine();
      printer.newLine();
      printer.newLine();
      printer.alignCenter();
      printer.println('_______________________');
      printer.println('Signature');
      printer.newLine();
      printer.alignLeft();
    } else {
      printer.println('TIN:');
      printer.println('Business Style:');
      printer.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

      if (isVatZR) {
        printer.newLine();
        printer.newLine();
        printer.newLine();
        printer.alignCenter();
        printer.println('_______________________');
        printer.println('Signature');
        printer.newLine();
        printer.alignLeft();
      }
    }

    printer.newLine();
    printer.leftRight(
      `STORE # ${cart.branchCode}`,
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );
    printer.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
    printer.println(`Txn No.: ${cart.newTxnNumber}`);
    printer.println(`Void No.: ${cart.voidNumber}`);
    printer.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

    printer.println(`Date-time: ${moment(cart.cartDate).format('MM-DD-YYYY hh:mm A')}`);

    printer.drawLine();
    printer.alignLeft();
    let totalNumItems = 0;
    order.products.forEach((product) => {
      totalNumItems += Number(product.quantity);
      printer.println(
        `${
          peripherals.includes(product.productCode) ? product.productUpgrade : product.productCode
        } ${product.productName}`
      );
      printer.leftRight(
        ` -${product.quantity} PIECE @ ${fCurrency('', roundUpAmount(product.price))}`,
        `${fCurrency(
          '-',
          product.overridedPrice
            ? roundUpAmount(product.overridedPrice)
            : roundUpAmount(product.price * product.quantity)
        )}`
      );
      if (product.discounts) {
        product.discounts.forEach((discount) => {
          printer.leftRight(
            `   LESS ${discount.receiptLabel} ${
              discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
            }`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }

      // printer.println(`   PO Number  : ${specs.poNumber}`);

      if (product.upgrades) {
        totalNumItems += product.upgrades.quantity;
        printer.println(`${product.upgrades.productCode} ${product.upgrades.itemName}`);
        printer.leftRight(
          ` -1 PIECE @ ${fCurrency('', roundUpAmount(product.upgrades.price))}`,
          `${fCurrency('-', roundUpAmount(product.upgrades.price))}`
        );
        if (product.upgrades.discounts) {
          product.upgrades.discounts.forEach((discount) => {
            printer.leftRight(
              `   LESS ${discount.receiptLabel} ${
                discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }
        // printer.println(`   PO Number  : ${specs.poNumber}`);
      }
    });
    if (order.discounts) {
      printer.newLine();
      order.discounts.forEach((discount) => {
        printer.leftRight(
          `   LESS (${discount.prefix})`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });
    }
    printer.newLine();
    printer.leftRight(`   No. of Items: ${totalNumItems}`, '');
    printer.drawLine();
  });
  printer.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

  cart.discounts
    .filter((x) => x.prefix !== 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight(
        `   LESS ${discount.receiptLabel} ${
          discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
        }`,
        `${fCurrency('-', roundUpAmount(discount.amount))}`
      );
    });

  cart.discounts
    .filter((x) => x.prefix === 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight('   POINTS REDEEM', fCurrency('-', roundUpAmount(discount.amount)));
    });

  printer.leftRight(
    '   Amount Due',
    fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
  );

  cart.payments.forEach((payment) => {
    if (payment.value === 'cash') {
      printer.leftRight('   CASH PESO', fCurrency('-', roundUpAmount(payment.amount)));
    } else if (payment.value === 'giftCard') {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);

      if (payment.changeType) {
        if (payment.changeRefNumber) {
          printer.leftRight(
            `   Change (Gift Card)`,
            fCurrency('-', roundUpAmount(payment.excessGcAmount))
          );
          printer.leftRight(`   Ref No.`, payment.changeRefNumber);
        }

        if (payment.excessCash !== 0) {
          printer.leftRight(`   Change (Cash)`, fCurrency('-', roundUpAmount(payment.excessCash)));
        }
      }
    } else if (payment.value === 'card') {
      printer.leftRight(
        payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
        fCurrency('-', roundUpAmount(payment.amount))
      );
      printer.println(`   Card No. : ************${payment.digitCode}`);
      printer.println(`   Slip No. : ${payment.slipNumber}`);
    } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);
    } else if (payment.value === 'cardNew') {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      printer.leftRight(`   Card No. :`, `************${payment.digitCode}`);
      printer.leftRight(`   Approval Code. :`, payment.approvalCode);
    } else if (payment.value.startsWith('CUSTOM::')) {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      if (payment.digitCode) {
        printer.leftRight(`   Card No.`, `************${payment.digitCode}`);
      }
      if (payment.referenceNumber) {
        printer.leftRight(`   Ref No.`, payment.referenceNumber);
      }
    }
  });

  if (
    cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length === 0
  ) {
    printer.leftRight('   Change', fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange))));
  }

  printer.newLine();
  printer.println(`Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`);
  printer.println(`VOID Remarks: ${cart.remarks || ''}`);
  printer.drawLine();

  let vatableSale = 0;
  let vatAmount = 0;
  let vatExempt = 0;
  let vatZeroRated = 0;
  let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

  if (cart.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'SCD-5%').length > 0) {
    vatExempt += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VAT')
      .forEach((discount) => {
        vatExempt -= discount.amount;
      });
  } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
    vatZeroRated += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        vatZeroRated -= discount.amount;
      });
  } else {
    cart.confirmOrders.forEach((order) => {
      order.products.forEach((specs, specsIndex) => {
        let specsPrice = specs.overridedPrice || specs.price * specs.quantity;

        if (specsIndex === 0) {
          if (cart.discounts) {
            cart.discounts.forEach((discount) => {
              specsPrice -= discount.amount;
            });
          }
        }

        if (specs.discounts) {
          if (
            specs.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX').length > 0
          ) {
            vatExempt += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX')
              .forEach((discount) => {
                vatExempt -= discount.amount;
              });
          } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
            vatZeroRated += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VATZR')
              .forEach((discount) => {
                vatZeroRated -= discount.amount;
              });
          } else {
            specs.discounts
              .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
              .forEach((discount) => {
                specsPrice -= discount.amount;
              });

            vatAmount -= specsPrice / 1.12 - specsPrice;
            vatableSale += specsPrice / 1.12;
          }
        } else {
          vatableSale += specsPrice / 1.12;
          vatAmount += specsPrice - specsPrice / 1.12;
        }

        if (specs.upgrades) {
          let upgradesPrice = specs.upgrades.price;

          if (specs.upgrades.discounts) {
            if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
              vatExempt += upgradesPrice;

              specs.upgrades.discounts.forEach((discount) => {
                vatExempt -= discount.amount;
              });
            } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.upgrades.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.upgrades.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  upgradesPrice -= discount.amount;
                });

              vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
              vatableSale += upgradesPrice / 1.12;
            }
          } else {
            vatAmount += upgradesPrice - upgradesPrice / 1.12;
            vatableSale += upgradesPrice / 1.12;
          }
        }
      });
    });
  }

  vatableSale = cart.isNonVat ? 0 : vatableSale;
  vatAmount = cart.isNonVat ? 0 : vatAmount;
  vatExempt = cart.isNonVat ? 0 : vatExempt;
  vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

  printer.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
  printer.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
  printer.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
  printer.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
  printer.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
  printer.alignRight();
  printer.println('----------');
  printer.leftRight(
    'Total',
    fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
  );
  printer.drawLine();

  if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
    printer.println(
      `Customer Loyalty No.: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
      }`
    );
    printer.println(
      `Previous Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
      }`
    );
    printer.println(
      `Redeemed Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
    printer.println(
      `Remaining Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
  }

  printer.newLine();
  printer.alignCenter();
  printer.println('THIS DOCUMENT IS NOT VALID FOR ');
  printer.println('CLAIM OF INPUT TAX');

  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  if (settings[SettingsCategoryEnum.UnitConfig].devMode) {
    console.log(printer.getText());

    res.status(200).json({ data: 'Please check console logs' });
  } else {
    try {
      await printer.execute();
      console.log('Print success.');
      res.status(200).json({ data: 'success' });
    } catch (error) {
      console.error('Print error:', error);
      res.status(500).json({ data: 'success' });
    }
  }
};

exports.printRefundReceipt = async (req, res, next) => {
  // const { cart, cashier, isReprint } = req.body;
  let { apiData, settings } = req.body;
  const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

  // apiData = JSON.parse(apiData);
  // settings = JSON.parse(settings);

  const { cart, cashier, isReprint } = apiData;

  if (!req.body) {
    const error = new HttpError('No content to print.', 422);
    return next(error);
  }

  let printer = new ThermalPrinter({
    type: Types.EPSON,
    interface: `//localhost/${settings[SettingsCategoryEnum.UnitConfig].printerName}`,
    width: '33px',
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: true,
    lineCharacter: '-'
  });

  const roundUpAmount = (num) => {
    // num = Math.round(num * 100) / 100;
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.UnitConfig].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '')
  printer.println(
    cart.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
  printer.newLine();
  printer.println('REFUND');
  isReprint && printer.println('(REPRINT)');

  let isScPwd = false;
  let scPwdIdNumber = '';
  let type = '';

  cart.discounts
    .filter(
      (x) =>
        x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
    )
    .forEach((discount) => {
      isScPwd = true;
      scPwdIdNumber = discount.idNumber;
      type = discount.prefix;
    });

  cart.confirmOrders.forEach((order) => {
    order.products.forEach((specs) => {
      if (specs.discounts) {
        specs.discounts
          .filter(
            (x) =>
              x.prefix === 'SCD' ||
              x.prefix === 'PWD' ||
              x.prefix === 'PNSTMD' ||
              (x.prefix === 'VAT' && x.prefix === 'PACKAGEDISCOUNT') ||
              x.prefix === 'VAT'
          )
          .forEach((discount) => {
            isScPwd = true;
            scPwdIdNumber = discount.idNumber;
            type = discount.prefix;
          });
      }
    });
  });

  let isVatZR = false;
  let vatZrRepresentative = '';
  let vatZrCert = '';

  cart.discounts
    .filter((x) => x.prefix === 'VATZR')
    .forEach((discount) => {
      isVatZR = true;
      vatZrRepresentative = discount.idNumber;
      vatZrCert = discount.pecaCertNo;
    });

  cart.confirmOrders.forEach((order) => {
    order.products.forEach((specs) => {
      if (specs.discounts) {
        specs.discounts
          .filter((x) => x.prefix === 'VATZR')
          .forEach((discount) => {
            isVatZR = true;
            vatZrRepresentative = discount.idNumber;
            vatZrCert = discount.pecaCertNo;
          });
      }
    });
  });

  printer.alignLeft();

  cart.confirmOrders.forEach((order) => {
    printer.newLine();

    if (isVatZR) {
      printer.println(
        `Customer: ${
          isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
        } `
      );
    } else if (isScPwd) {
      printer.println(
        `Customer: ${`${order.lasName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
      );
    } else {
      const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
      printer.println(
        `Customer: ${
          notGuest ? order.lasName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
        }`
      );
    }

    printer.println('Address:');

    // if (order.discounts) {
    //   if (
    //     order.discounts.filter(
    //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
    //     ).length > 0
    //   ) {
    //     isScPwd = true;
    //   }
    // }

    if (isScPwd) {
      if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
        printer.println('SC/PWD TIN:');
      }

      printer.println(
        `${
          type === 'SCD' ||
          type === 'SCD-5%' ||
          type === 'PWD' ||
          (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
          type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
        } ${scPwdIdNumber}`
      );
      printer.newLine();
      printer.newLine();
      printer.newLine();
      printer.alignCenter();
      printer.println('_______________________');
      printer.println('Signature');
      printer.newLine();
      printer.alignLeft();
    } else {
      printer.println('TIN:');
      printer.println('Business Style:');
      printer.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

      if (isVatZR) {
        printer.newLine();
        printer.newLine();
        printer.newLine();
        printer.alignCenter();
        printer.println('_______________________');
        printer.println('Signature');
        printer.newLine();
        printer.alignLeft();
      }
    }

    printer.newLine();
    printer.leftRight(
      `STORE # ${cart.branchCode}`,
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );
    printer.leftRight(`SI No.: ${cart.siNumber}-1`, 'PHP');
    printer.println(`Txn No.: ${cart.newTxnNumber}`);
    printer.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

    printer.println(`Date-time: ${moment(cart.cartDate).format('MM-DD-YYYY hh:mm A')}`);

    printer.drawLine();
    printer.alignLeft();
    let totalNumItems = 0;
    order.products.forEach((specs) => {
      totalNumItems += Number(specs.quantity);
      printer.println(
        `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${
          specs.productName
        }`
      );
      printer.leftRight(
        ` -${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
        `${fCurrency(
          '-',
          specs.overridedPrice
            ? roundUpAmount(specs.overridedPrice)
            : roundUpAmount(specs.price * specs.quantity)
        )}`
      );
      if (specs.discounts) {
        specs.discounts.forEach((discount) => {
          printer.leftRight(
            `   LESS ${discount.receiptLabel} ${
              discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
            }`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }

      // printer.println(`   PO Number  : ${specs.poNumber}`);

      if (specs.upgrades) {
        totalNumItems += specs.upgrades.quantity;
        printer.println(`${specs.upgrades.productCode} ${specs.upgrades.itemName}`);
        printer.leftRight(
          ` -1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
          `${fCurrency('-', roundUpAmount(specs.upgrades.price))}`
        );
        if (specs.upgrades.discounts) {
          specs.upgrades.discounts.forEach((discount) => {
            printer.leftRight(
              `   LESS ${discount.receiptLabel} ${
                discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }
        // printer.println(`   PO Number  : ${specs.poNumber}`);
      }
    });
    if (order.discounts) {
      printer.newLine();
      order.discounts.forEach((discount) => {
        printer.leftRight(
          `   LESS (${discount.prefix})`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });
    }
    printer.newLine();
    printer.leftRight(`   No. of Items: ${totalNumItems}`, '');
    printer.drawLine();
  });
  printer.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

  cart.discounts
    .filter((x) => x.prefix !== 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight(
        `   LESS ${discount.receiptLabel} ${
          discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
        }`,
        `${fCurrency('-', roundUpAmount(discount.amount))}`
      );
    });

  cart.discounts
    .filter((x) => x.prefix === 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight('   POINTS REDEEM', fCurrency('-', roundUpAmount(discount.amount)));
    });

  printer.leftRight(
    '   Amount Due',
    fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
  );

  cart.payments.forEach((payment) => {
    if (payment.value === 'cash') {
      printer.leftRight('   CASH PESO', fCurrency('-', roundUpAmount(payment.amount)));
    } else if (payment.value === 'giftCard') {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);

      if (payment.changeType) {
        if (payment.changeRefNumber) {
          printer.leftRight(
            `   Change (Gift Card)`,
            fCurrency('-', roundUpAmount(payment.excessGcAmount))
          );
          printer.leftRight(`   Ref No.`, payment.changeRefNumber);
        }

        if (payment.excessCash !== 0) {
          printer.leftRight(`   Change (Cash)`, fCurrency('-', roundUpAmount(payment.excessCash)));
        }
      }
    } else if (payment.value === 'card') {
      printer.leftRight(
        payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
        fCurrency('-', roundUpAmount(payment.amount))
      );
      printer.println(`   Card No. : ************${payment.digitCode}`);
      printer.println(`   Slip No. : ${payment.slipNumber}`);
    } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);
    }  else if (payment.value === 'cardNew') {
      printer.leftRight(
        `   ${payment.label}`,
        fCurrency('-', roundUpAmount(payment.amount))
      );
      printer.leftRight(
        `   Card No. :`,
        `************${payment.digitCode}`
      );
      printer.leftRight(
        `   Approval Code. :`,
        payment.approvalCode
      );
    } else if (payment.value.startsWith('CUSTOM::')) {
      printer.leftRight(`   ${payment.label}`, fCurrency('-', roundUpAmount(payment.amount)));
      if (payment.digitCode) {
        printer.leftRight(`   Card No.`, `************${payment.digitCode}`);
      }
      if (payment.referenceNumber) {
        printer.leftRight(`   Ref No.`, payment.referenceNumber);
      }
    }
  });

  if (
    cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length === 0
  ) {
    printer.leftRight('   Change', fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange))));
  }

  printer.newLine();
  printer.println(`Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`);
  printer.println(`REFUND Remarks: ${cart.remarks || ''}`);
  printer.drawLine();

  let vatableSale = 0;
  let vatAmount = 0;
  let vatExempt = 0;
  let vatZeroRated = 0;
  let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

  if (cart.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'SCD-5%').length > 0) {
    vatExempt += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VAT')
      .forEach((discount) => {
        vatExempt -= discount.amount;
      });
  } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
    vatZeroRated += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        vatZeroRated -= discount.amount;
      });
  } else {
    cart.confirmOrders.forEach((order) => {
      order.products.forEach((specs, specsIndex) => {
        let specsPrice = specs.overridedPrice || specs.price * specs.quantity;

        if (specsIndex === 0) {
          if (cart.discounts) {
            cart.discounts.forEach((discount) => {
              specsPrice -= discount.amount;
            });
          }
        }

        if (specs.discounts) {
          if (
            specs.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX').length > 0
          ) {
            vatExempt += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX')
              .forEach((discount) => {
                vatExempt -= discount.amount;
              });
          } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
            vatZeroRated += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VATZR')
              .forEach((discount) => {
                vatZeroRated -= discount.amount;
              });
          } else {
            specs.discounts
              .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
              .forEach((discount) => {
                specsPrice -= discount.amount;
              });

            vatAmount -= specsPrice / 1.12 - specsPrice;
            vatableSale += specsPrice / 1.12;
          }
        } else {
          vatableSale += specsPrice / 1.12;
          vatAmount += specsPrice - specsPrice / 1.12;
        }

        if (specs.upgrades) {
          let upgradesPrice = specs.upgrades.price;

          if (specs.upgrades.discounts) {
            if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
              vatExempt += upgradesPrice;

              specs.upgrades.discounts.forEach((discount) => {
                vatExempt -= discount.amount;
              });
            } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.upgrades.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.upgrades.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  upgradesPrice -= discount.amount;
                });

              vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
              vatableSale += upgradesPrice / 1.12;
            }
          } else {
            vatAmount += upgradesPrice - upgradesPrice / 1.12;
            vatableSale += upgradesPrice / 1.12;
          }
        }
      });
    });
  }

  vatableSale = cart.isNonVat ? 0 : vatableSale;
  vatAmount = cart.isNonVat ? 0 : vatAmount;
  vatExempt = cart.isNonVat ? 0 : vatExempt;
  vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

  printer.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
  printer.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
  printer.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
  printer.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
  printer.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
  printer.alignRight();
  printer.println('----------');
  printer.leftRight(
    'Total',
    fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
  );
  printer.drawLine();

  if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
    printer.println(
      `Customer Loyalty No.: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
      }`
    );
    printer.println(
      `Previous Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
      }`
    );
    printer.println(
      `Redeemed Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
    printer.println(
      `Remaining Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
  }

  printer.newLine();
  printer.alignCenter();
  printer.println('THIS DOCUMENT IS NOT VALID FOR ');
  printer.println('CLAIM OF INPUT TAX');

  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();

  if (settings[SettingsCategoryEnum.UnitConfig].devMode) {
    console.log(printer.getText());

    res.status(200).json({ data: 'Please check console logs' });
  } else {
    try {
      await printer.execute();
      console.log('Print success.');
      res.status(200).json({ data: 'success' });
    } catch (error) {
      console.error('Print error:', error);
      res.status(500).json({ data: 'success' });
    }
  }
};

exports.printReturnReceipt = async (req, res, next) => {
  const { cart, cashier, isReprint, settings, orig } = req.body;
  const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

  if (!req.body) {
    const error = new HttpError('No content to print.', 422);
    return next(error);
  }

  let printer = new ThermalPrinter({
    type: Types.EPSON,
    interface: `//localhost/${settings[SettingsCategoryEnum.UnitConfig].printerName}`,
    width: '33px',
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: true,
    lineCharacter: '-'
  });

  const roundUpAmount = (num) => {
    // num = Math.round(num * 100) / 100;
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.UnitConfig].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  if (settings[SettingsCategoryEnum.CompanyInfo].activeCategory === 'FACE') {
    printer.println('Sunnies Face');
  }
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '')
  printer.println(
    cart.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
  printer.newLine();
  printer.println('RETURN');
  isReprint && printer.println('(REPRINT)');

  let isScPwd = false;
  let scPwdIdNumber = '';
  let type = '';

  cart.discounts
    .filter(
      (x) =>
        x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
    )
    .forEach((discount) => {
      isScPwd = true;
      scPwdIdNumber = discount.idNumber;
      type = discount.prefix;
    });

  cart.confirmOrders.forEach((order) => {
    order.products.forEach((specs) => {
      if (specs.discounts) {
        specs.discounts
          .filter((x) => x.prefix === 'SCD' || x.prefix === 'PWD' || x.prefix === 'PNSTMD')
          .forEach((discount) => {
            isScPwd = true;
            scPwdIdNumber = discount.idNumber;
            type = discount.prefix;
          });
      }
    });
  });

  let isVatZR = false;
  let vatZrRepresentative = '';
  let vatZrCert = '';

  cart.discounts
    .filter((x) => x.prefix === 'VATZR')
    .forEach((discount) => {
      isVatZR = true;
      vatZrRepresentative = discount.idNumber;
      vatZrCert = discount.pecaCertNo;
    });

  cart.confirmOrders.forEach((order) => {
    order.products.forEach((specs) => {
      if (specs.discounts) {
        specs.discounts
          .filter((x) => x.prefix === 'VATZR')
          .forEach((discount) => {
            isVatZR = true;
            vatZrRepresentative = discount.idNumber;
            vatZrCert = discount.pecaCertNo;
          });
      }
    });
  });

  printer.alignLeft();

  cart.confirmOrders.forEach((order) => {
    printer.newLine();

    if (isVatZR) {
      printer.println(
        `Customer: ${
          isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
        } `
      );
    } else if (isScPwd) {
      printer.println(
        `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
      );
    } else {
      const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
      printer.println(
        `Customer: ${
          notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
        }`
      );
    }

    printer.println('Address:');

    // if (order.discounts) {
    //   if (
    //     order.discounts.filter(
    //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
    //     ).length > 0
    //   ) {
    //     isScPwd = true;
    //   }
    // }

    if (isScPwd) {
      if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
        printer.println('SC/PWD TIN:');
      }

      printer.println(
        `${
          type === 'SCD' ||
          type === 'SCD-5%' ||
          type === 'PWD' ||
          (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
          type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
        } ${scPwdIdNumber}`
      );
      printer.newLine();
      printer.newLine();
      printer.newLine();
      printer.alignCenter();
      printer.println('_______________________');
      printer.println('Signature');
      printer.newLine();
      printer.alignLeft();
    } else {
      printer.println('TIN:');
      printer.println('Business Style:');
      printer.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

      if (isVatZR) {
        printer.newLine();
        printer.newLine();
        printer.newLine();
        printer.alignCenter();
        printer.println('_______________________');
        printer.println('Signature');
        printer.newLine();
        printer.alignLeft();
      }
    }

    printer.newLine();
    printer.leftRight(`STORE # ${cart.branchCode}`, `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);
    printer.leftRight(`SI No.: ${cart.newSiNumber}`, 'PHP');
    printer.println(`Txn No.: ${cart.newTxnNumber}`);
    printer.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

    printer.println(`Date-time: ${moment(cart.returnDate).format('MM/DD/YYYY - hh:mm A')}`);

    printer.drawLine();
    printer.alignLeft();
    let totalNumItems = 0;
    order.products.forEach((specs) => {
      totalNumItems += 1;
      printer.println(
        `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${
          specs.productName
        }`
      );
      printer.leftRight(
        ` -${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
        `${fCurrency(
          '-',
          specs.overridedPrice
            ? roundUpAmount(specs.overridedPrice * specs.quantity)
            : roundUpAmount(specs.price * specs.quantity)
        )}`
      );
      if (specs.discounts) {
        specs.discounts.forEach((discount) => {
          printer.leftRight(
            `   LESS ${discount.receiptLabel} ${
              discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
            }`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }

      // printer.println(`   PO Number  : ${specs.poNumber}`);

      if (specs.upgrades) {
        totalNumItems += 1;
        printer.println(`${specs.upgrades.productCode} ${specs.upgrades.itemName}`);
        printer.leftRight(
          ` -1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
          `${fCurrency('-', roundUpAmount(specs.upgrades.price))}`
        );
        if (specs.upgrades.discounts) {
          specs.upgrades.discounts.forEach((discount) => {
            printer.leftRight(
              `   LESS ${discount.receiptLabel} ${
                discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }
        // printer.println(`   PO Number  : ${specs.poNumber}`);
      }
    });
    if (order.discounts) {
      printer.newLine();
      order.discounts.forEach((discount) => {
        printer.leftRight(
          `   LESS (${discount.prefix})`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });
    }
    printer.newLine();
    printer.leftRight(`   No. of Items: ${totalNumItems}`, '');
    printer.drawLine();
  });
  printer.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

  cart.discounts
    .filter((x) => x.prefix !== 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight(
        `   LESS ${discount.receiptLabel} ${
          discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
        }`,
        `${fCurrency('-', roundUpAmount(discount.amount))}`
      );
    });

  cart.discounts
    .filter((x) => x.prefix === 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight('   POINTS REDEEM', fCurrency('-', roundUpAmount(discount.amount)));
    });

  printer.leftRight(
    '   Amount Due',
    fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
  );
  printer.leftRight(
    '   Return Within 30 Days',
    fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
  );

  // cart.payments.forEach((payment) => {
  //   if (payment.value === 'cash') {
  //     printer.leftRight('   CASH PESO', fCurrency('-', roundUpAmount(payment.amount)));
  //   } else if (payment.value === 'giftCard') {
  //     printer.leftRight(
  //       `   ${payment.label}`,
  //       fCurrency('-', roundUpAmount(payment.amount))
  //     );
  //     printer.leftRight(`   Ref No.`, payment.referenceNumber);

  //     if (payment.changeType) {
  //       if (payment.changeRefNumber) {
  //         printer.leftRight(
  //           `   Change (Gift Card)`,
  //           fCurrency('-', roundUpAmount(payment.excessGcAmount))
  //         );
  //         printer.leftRight(`   Ref No.`, payment.changeRefNumber);
  //       }

  //       if (payment.excessCash !== 0) {
  //         printer.leftRight(
  //           `   Change (Cash)`,
  //           fCurrency('-', roundUpAmount(payment.excessCash))
  //         );
  //       }
  //     }
  //   } else if (payment.value === 'card') {
  //     printer.leftRight(
  //       payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
  //       fCurrency('-', roundUpAmount(payment.amount))
  //     );
  //     printer.println(`   Card No. : ************${payment.digitCode}`);
  //     printer.println(`   Slip No. : ${payment.slipNumber}`);
  //   } else if (payment.value === 'eWallet') {
  //     printer.leftRight(
  //       `   ${payment.label}`,
  //       fCurrency('-', roundUpAmount(payment.amount))
  //     );
  //     printer.leftRight(`   Ref No.`, payment.referenceNumber);
  //   }
  // });

  // if (
  //   cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length === 0
  // ) {
  //   printer.leftRight(
  //     '   Change',
  //     fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange)))
  //   );
  // }

  printer.newLine();
  printer.println(`Orig Store  : ${cart.branchCode}`);
  printer.println(`Orig POS #  : ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);
  printer.println(`Orig Txn No.: ${orig.txnNumber}`);
  printer.println(`Orig SI No. : ${orig.siNumber}`);

  printer.newLine();
  printer.println(`Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`);
  printer.println(`RETURN Remarks: ${cart.remarks || ''}`);

  let vatableSale = 0;
  let vatAmount = 0;
  let vatExempt = 0;
  let vatZeroRated = 0;
  let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

  if (
    cart.discounts.filter(
      (x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'SCD-5%'
    ).length > 0
  ) {
    vatExempt += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VAT')
      .forEach((discount) => {
        vatExempt -= discount.amount;
      });
  } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
    vatZeroRated += cart.amounts.subtotal;

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        vatZeroRated -= discount.amount;
      });
  } else {
    cart.confirmOrders.forEach((order) => {
      order.products.forEach((specs, specsIndex) => {
        let specsPrice = specs.overridedPrice || specs.price * specs.quantity;

        if (specsIndex === 0) {
          if (cart.discounts) {
            cart.discounts.forEach((discount) => {
              specsPrice -= discount.amount;
            });
          }
        }

        if (specs.discounts) {
          if (
            specs.discounts.filter(
              (x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX'
            ).length > 0
          ) {
            vatExempt += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX')
              .forEach((discount) => {
                vatExempt -= discount.amount;
              });
          } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
            vatZeroRated += specsPrice;

            specs.discounts
              .filter((x) => x.prefix === 'VATZR')
              .forEach((discount) => {
                vatZeroRated -= discount.amount;
              });
          } else {
            specs.discounts
              .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
              .forEach((discount) => {
                specsPrice -= discount.amount;
              });

            vatAmount -= specsPrice / 1.12 - specsPrice;
            vatableSale += specsPrice / 1.12;
          }
        } else {
          vatableSale += specsPrice / 1.12;
          vatAmount += specsPrice - specsPrice / 1.12;
        }

        if (specs.upgrades) {
          let upgradesPrice = specs.upgrades.price;

          if (specs.upgrades.discounts) {
            if (
              specs.upgrades.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS')
                .length > 0
            ) {
              vatExempt += upgradesPrice;

              specs.upgrades.discounts.forEach((discount) => {
                vatExempt -= discount.amount;
              });
            } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.upgrades.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.upgrades.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  upgradesPrice -= discount.amount;
                });

              vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
              vatableSale += upgradesPrice / 1.12;
            }
          } else {
            vatAmount += upgradesPrice - upgradesPrice / 1.12;
            vatableSale += upgradesPrice / 1.12;
          }
        }
      });
    });
  }

  vatableSale = cart.isNonVat ? 0 : vatableSale;
  vatAmount = cart.isNonVat ? 0 : vatAmount;
  vatExempt = cart.isNonVat ? 0 : vatExempt;
  vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

  printer.drawLine();
  printer.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
  printer.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
  printer.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
  printer.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
  printer.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
  printer.alignRight();
  printer.println('----------');
  printer.leftRight(
    'Total',
    fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
  );
  printer.drawLine();

  if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
    printer.println(
      `Customer Loyalty No.: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
      }`
    );
    printer.println(
      `Previous Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
      }`
    );
    printer.println(
      `Redeemed Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
    printer.println(
      `Remaining Points: ${
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
  }

  printer.newLine();
  printer.alignCenter();
  printer.println('Umbra Digital Company');
  printer.println('930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines');
  printer.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
  printer.println(
    `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${
      settings[SettingsCategoryEnum.BirInfo].accrDateIssued
    }`
  );
  printer.println(
    `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${
      settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
    }`
  );

  printer.newLine();
  printer.alignCenter();
  printer.println('Thank you for shopping');
  printer.println(`Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`);

  if (cart.isNonVat) {
    printer.newLine();
    printer.println('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX');
  }

  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();
  printer.newLine();

  if (settings[SettingsCategoryEnum.UnitConfig].devMode) {
    console.log(printer.getText());

    res.status(200).json({ data: 'Please check console logs' });
  } else {
    try {
      await printer.execute();
      console.log('Print success.');
      res.status(200).json({ data: 'success' });
    } catch (error) {
      console.error('Print error:', error);
      res.status(500).json({ data: 'success' });
    }
  }
};

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};
