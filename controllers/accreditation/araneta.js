const os = require('os');
const HttpError = require('../../middleware/http-error');
const Papa = require('papaparse');
const path = require('path');
const moment = require('moment');
const fs = require('fs');
const cDrivePath = path.join(os.homedir().split(path.sep)[0], path.sep);
const Preview = require('../../models/Preview');
const Transaction = require('../../models/Transaction');
const TransactionAmount = require('../../models/TransactionAmount');
const { SettingsCategoryEnum } = require('../common/settingsData');

exports.createDailySalesReport = async (req, res, next) => {
  const { cart, settings, posDate, action } = req.body;
  const transactionDate = posDate.split(' ')[0];
  const transactionNumber = cart.txnNumber;
  const realTime = action ? moment().format('HH:mm:ss') : cart.cartDate.split(' ')[1];

  try {
    // Check if file exists
    const filePath = path.join(cDrivePath, 'ARANETA');
    const fileName = `${moment(transactionDate).format('MMDDYYYY')}.csv`;
    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });
    const fileExists = fs.existsSync(path.join(filePath, fileName));

    // Get the number of transactions
    const [txnCount] = await Transaction.aggregate([
      {
        $match: {
          transactionDate: {
            $gte: new Date(`${transactionDate}T00:00:00.000Z`),
            $lt: new Date(`${transactionDate}T${realTime}.000Z`)
          },
          type: { $in: ['regular', 'void', 'refund', 'return'] }
        }
      },
      {
        $count: 'txnCount'
      }
    ]);

    const data = await getTransactionDetails(
      transactionDate,
      transactionNumber,
      realTime,
      cart,
      settings,
      action,
      txnCount ? txnCount.txnCount : 0
    );

    // Save file
    if (!fileExists) {
      const newCsv = [data];
      fs.writeFileSync(
        path.join(filePath, fileName),
        Papa.unparse(newCsv, { header: false, quotes: false, delimiter: ',' })
      );
    } else {
      const newCsv = [data];
      fs.writeFileSync(
        path.join(filePath, fileName),
        Papa.unparse(newCsv, { header: false, quotes: false, delimiter: ',' })
      );
    }

    return res.status(200).json({ message: 'test' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      err,
      req,
      'Something went wrong on creating Araneta sales file',
      500
    );
    return next(error);
  }
};

exports.createZReadReport = async (req, res, next) => {
  try {
    const { transactionDate, settings, user } = req.body;

    const { storeCode, snMin } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

    const { companyName, companyAddress1 } = settings[SettingsCategoryEnum.CompanyInfo] ?? {};

    const existingZRead = await Preview.find({
      storeCode: storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);

    if (existingZRead.length === 0) {
      const error = new HttpError(
        new Error('The current date you selected does not contain EOD data yet.'),
        req,
        'The current date you selected does not contain EOD data yet.',
        422
      );
      return next(error);
    }

    const zRead = existingZRead[0];
    const { zReadData } = zRead.data;

    const [firstTxnQuery] = await Transaction.aggregate([
      {
        $match: {
          transactionDate: {
            $gte: new Date(`${transactionDate}T00:00:00.000Z`),
            $lte: new Date(`${transactionDate}T23:59:59.999Z`)
          }
        }
      },
      {
        $sort: {
          transactionDate: 1
        }
      },
      {
        $limit: 1
      },
      {
        $project: {
          txn_number: '$txnNumber'
        }
      }
    ]);

    const beginTxnNumber = firstTxnQuery?.txn_number

    const [lastTxnQuery] = await Transaction.aggregate([
        {
          $match: {
            transactionDate: {
              $gte: new Date(`${transactionDate}T00:00:00.000Z`),
              $lte: new Date(`${transactionDate}T23:59:59.999Z`)
            }
          }
        },
        {
          $sort: {
            transactionDate: -1
          }
        },
        {
          $limit: 1
        },
        {
          $project: {
            txn_number: '$txnNumber'
          }
        }
      ]);
  
      const lastTxnNumber = lastTxnQuery?.txn_number

    const data = {
      'Store/Lessee Name': companyName,
      Address: companyAddress1,
      'Tax Identification Number (TIN) / Serial Number (SN) / Machine Identification Number (MIN)': `/ ${snMin}`,
      'Z Reading Number': zReadData.zReadLogsCount,
      'Cashier Name & ID': `${user.firstname} ${user.lastname} ${user.employeeId}`,
      'Gross Amount': parseFloat(zReadData.SALES.gross).toFixed(2),
      Discount: parseFloat(zReadData.discounts.summary.total).toFixed(2),
      'Refund/Void/Returns': parseFloat(
        (zReadData.cashierAudit.VOID_TXN_AMOUNT ?? 0) +
          (zReadData.cashierAudit.REFUND_TXN_AMOUNT
            ? Math.abs(zReadData.cashierAudit.REFUND_TXN_AMOUNT)
            : 0) +
          zReadData.returns.summary.total
      ).toFixed(2),
      'Net Amount': zReadData.SALES.net ?? 0,
      'Taxable Sales': parseFloat(zReadData.vat.VAT_DETAILS.vatableSales ?? 0).toFixed(2),
      '12% VAT': parseFloat(zReadData.vat.VAT_DETAILS.vatAmount ?? 0).toFixed(2),
      'Vat-Exempt Sales': parseFloat(zReadData.vat.VAT_DETAILS.vatExemptSales ?? 0).toFixed(2),
      'Breakdown of Cash': '',
      'Breakdown of Charge': '',
      'Breakdown of Gift Transactions': '',
      'Breakdown of Debit Card': '',
      'Breakdown of Charge Sales': '',
      'Beginning Transaction Number': beginTxnNumber,
      'Ending Transaction Number': lastTxnNumber,
      'Old Grand Total': zReadData.ACCUMULATED_SALES.old,
      'New Grand Total': zReadData.ACCUMULATED_SALES.new
    };

    const filePath = path.join(cDrivePath, 'ARANETA');
    const fileName = `Z${moment(transactionDate).format('MMDDYYYY')}.flg`;
    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });

    const newCsv = [data];
    fs.writeFileSync(
      path.join(filePath, fileName),
      Papa.unparse(newCsv, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
    );
    return res.status(200).json({ message: 'Successfully created Araneta Z-report file' });
  } catch (err) {
    const error = new HttpError(err, req, 'Something went wrong on creating Z-Read report.', 500);
    return next(error);
  }
};

exports.regenerateDailySalesReport = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const transactions = await Preview.find({
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      },
      type: { $in: ['regular', 'void', 'refund', 'return'] }
    });

    if (transactions?.length === 0) {
      return res.status(200).json({ message: 'No transactions for this day.' });
    }

    let data = [];
    for (const [index, transaction] of transactions.entries()) {
      const { cart } = transaction.data;
      let txnNumber;
      let action = null;

      const [, realTime] = moment(transaction.transactionDate).utc().format('YYYY-MM-DD HH:mm:ss').split(' ') ;

      // Get original transaction number of voided, refunded, and returned transactions
      if (transaction.type !== 'regular') {
        const siNumber = transaction.type === 'void' ? cart.siNumber : cart.siNumber.split('-')[0];

        const [origTxn] = await Transaction.find({
          siNumber: siNumber
        });

        txnNumber = origTxn.txnNumber;
        action = transaction.type;
      } else {
        txnNumber = transaction.txnNumber;
      }

      data = await getTransactionDetails(
        transactionDate,
        txnNumber,
        realTime,
        cart,
        settings,
        action,
        index
      );
    }

    const filePath = path.join(cDrivePath, 'ARANETA');
    const fileName = `${moment(transactionDate).format('MMDDYYYY')}.csv`;
    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });

    const newCsv = [data];
    fs.writeFileSync(
      path.join(filePath, fileName),
      Papa.unparse(newCsv, { header: false, quotes: false, delimiter: ',' })
    );

    return res.status(200).json({ message: 'Test' });
  } catch (err) {
    console.log(err);
    return res.send(err.message)
    // const error = new HttpError(
    //   err,
    //   req,
    //   'Something went wrong on regenerating the daily sales files.'
    // );
    // return next(error);
  }
};

async function getTransactionDetails(
  transactionDate,
  transactionNumber,
  realTime,
  cart,
  settings,
  action,
  index
) {
  const { storeCode, snMin, terminalNumber } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
  const {
    aranetaMallCode,
    aranetaContractNumber,
    aranetaOpenField1,
    aranetaOpenField2,
    aranetaOutletNumber,
    aranetaSalesType
  } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

  // Get all discounts for the transaction
  const totalDiscounts = {
    regular: { count: 0, total: 0 },
    employee: { count: 0, total: 0 },
    scd: { count: 0, total: 0 },
    vip: { count: 0, total: 0 },
    pwd: { count: 0, total: 0 },
    other: { count: 0, total: 0 }
  };

  const totalPayments = {
    cash: { count: 0, total: 0 },
    debit: { count: 0, total: 0 },
    mastercard: { count: 0, total: 0 },
    visa: { count: 0, total: 0 },
    amex: { count: 0, total: 0 },
    gc: { count: 0, total: 0 },
    diners: { count: 0, total: 0 },
    jcb: { count: 0, total: 0 },
    charge: { count: 0, total: 0 },
    other: { count: 0, total: 0 }
  };

  let vatableSales, vatAmount, vatExempt, vatZeroRated;
  if (action) {
    vatableSales = 0;
    vatAmount = 0;
    vatExempt = 0;
    vatZeroRated = 0;
  } else {
    // Iterate all discounts per item in the order
    cart.confirmOrders.forEach((order) => {
      order.products.forEach((specs) => {
        if (specs.discounts) {
          specs.discounts.forEach((discount) => {
            if (discount.prefix === 'EMPLOYEE') {
              totalDiscounts.employee.count += 1;
              totalDiscounts.employee.total += discount.amount;
            } else if (discount.prefix === 'SCD') {
              totalDiscounts.scd.count += 1;
              totalDiscounts.scd.total += discount.amount;
            } else if (discount.prefix === 'PWD') {
              totalDiscounts.pwd.count += 1;
              totalDiscounts.pwd.total += discount.amount;
            } else if (discount.prefix === 'VIP') {
              totalDiscounts.vip.count += 1;
              totalDiscounts.vip.total += discount.amount;
            } else if (discount.prefix === 'FIXED' || discount.prefix === 'PERCENTAGE') {
              totalDiscounts.regular.count += 1;
              totalDiscounts.regular.total += discount.amount;
            } else if (discount.prefix === 'VAT') {
              return;
            } else {
              totalDiscounts.other.count += 1;
              totalDiscounts.other.total += discount.amount;
            }
          });
        }
      });
    });

    // Iterate through all the discounts in a transaction in
    cart.discounts.forEach((discount) => {
      if (discount.prefix === 'FIXED' || discount.prefix === 'PERCENTAGE') {
        totalDiscounts.regular.count += 1;
        totalDiscounts.regular.total += discount.amount;
      } else {
        totalDiscounts.other.count += 1;
        totalDiscounts.other.total += discount.amount;
      }
    });

    let amountDue = cart.amounts.noPayment;
    // Iterate through all payments
    cart.payments.forEach((payment) => {
      if (payment.value === 'cash') {
        totalPayments.cash.count += 1;
        totalPayments.cash.total += amountDue < payment.amount ? amountDue : payment.amount;
      } else if (payment.value === 'card' && payment.cardType === 'credit-card') {
        totalPayments.mastercard.count += 1;
        totalPayments.mastercard.total += amountDue < payment.amount ? amountDue : payment.amount;

        totalPayments.charge.count += 1;
        totalPayments.charge.total += amountDue < payment.amount ? amountDue : payment.amount;
      } else if (payment.value === 'card' && payment.cardType === 'debit-card') {
        totalPayments.debit.count += 1;
        totalPayments.debit.total += amountDue < payment.amount ? amountDue : payment.amount;

        totalPayments.charge.count += 1;
        totalPayments.charge.total += amountDue < payment.amount ? amountDue : payment.amount;
      } else if (payment.value === 'giftCard') {
        totalPayments.gc.count += 1;
        totalPayments.gc.total += amountDue < payment.amount ? amountDue : payment.amount;

        totalPayments.charge.count += 1;
        totalPayments.charge.total += amountDue < payment.amount ? amountDue : payment.amount;
      } else {
        totalPayments.other.count += 1;
        totalPayments.other.total += amountDue < payment.amount ? amountDue : payment.amount;

        totalPayments.charge.count += 1;
        totalPayments.charge.total += amountDue < payment.amount ? amountDue : payment.amount;
      }

      amountDue -= payment.amount;
    });

    const [txnAmounts] = await TransactionAmount.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $project: {
          _id: 0,
          vatableSales: '$vatableSale',
          vatAmount: 1,
          vatExempt: 1,
          vatZeroRated: 1,
          totalAmount: 1
        }
      }
    ]);

    vatableSales = txnAmounts.vatableSales;
    vatAmount = txnAmounts.vatAmount;
    vatExempt = txnAmounts.vatExempt;
    vatZeroRated = txnAmounts.vatZeroRated;
  }

  const [si_number] = await Transaction.aggregate([
    {
      $match: {
        transactionDate: {
          $gte: new Date(`${transactionDate}T00:00:00.000Z`),
          $lte: new Date(`${transactionDate}T23:59:59.999Z`)
        },
        siNumber: { $ne: '' }
      }
    },
    {
      $sort: {
        transactionDate: 1
      }
    },
    {
      $limit: 1
    },
    {
      $project: {
        txn_number: '$txnNumber',
        si_number: '$siNumber'
      }
    }
  ]);

  const [lastSiNumber] = await Transaction.aggregate([
    {
      $match: {
        transactionDate: {
          $gte: new Date(`${transactionDate}T00:00:00.000Z`),
          $lte: new Date(`${transactionDate}T23:59:59.999Z`)
        },
        siNumber: { $ne: '' },
        type: { $in: ['regular', 'void', 'refund', 'return'] }
      }
    },
    {
      $sort: {
        transactionDate: -1
      }
    },
    {
      $limit: 1
    },
    {
      $project: {
        txn_number: '$txnNumber',
        si_number: '$siNumber'
      }
    }
  ]);

  const previousTxns = await Transaction.aggregate([
    {
      $match: {
        type: { $in: ['regular', 'void', 'refund', 'return'] },
        storeCode: storeCode,
        transactionDate: { $lt: new Date(`${transactionDate}T${realTime}.000Z`) }
      }
    },
    {
      $group: {
        _id: '$type',
        amount: { $sum: '$amount' }
      }
    },
    {
      $project: {
        _id: 0,
        type: '$_id',
        amount: 1
      }
    }
  ]);

  console.log('previousTxns ', previousTxns);

  let regularTxnsAmount = 0;
  let nonRegularTxnsAmount = 0;

  previousTxns?.forEach((txn) => {
    if (txn.type !== 'regular') nonRegularTxnsAmount += Math.abs(txn.amount);
    else regularTxnsAmount += txn.amount;
  });

  console.log('Regular Transactions are ', regularTxnsAmount);
  console.log('Nonregular transactions are ', nonRegularTxnsAmount);

  const latestZRead = await Preview.findOne({ type: 'z-read' }, {}, { sort: { createdAt: -1 } });

  const oldGrandTotal = regularTxnsAmount - nonRegularTxnsAmount;
  // const oldGrandTotal = (oldSuccessPayments?.amount ?? 0) + (action? cart.amounts.noPayment:0)
  const newGrandTotal =
    oldGrandTotal + (action ? -1 * cart.amounts.noPayment : cart.amounts.noPayment);

  // Other values
  const serviceCharges = 0;
  const otherCharges = 0;
  const otherTax = 0;
  const totalDiscountsAmount = action
    ? 0
    : Object.keys(totalDiscounts).reduce((sum, key) => {
        return (sum += totalDiscounts[`${key}`].total);
      }, 0);
  const vatInclusiveSales = action ? 0 : Number(vatableSales) + Number(vatAmount);
  const nonVatSales = action ? 0 : Number(vatExempt);
  const vatZeroRatedSales = action ? 0 : Number(vatZeroRated);
  const valueAddedTax = action ? 0 : (vatInclusiveSales / 1.12) * 0.12;
  const grossSales = action
    ? 0
    : vatInclusiveSales +
      nonVatSales +
      vatZeroRatedSales +
      serviceCharges +
      otherCharges +
      otherTax +
      totalDiscountsAmount;
  const totalSales = action ? 0 : grossSales - totalDiscountsAmount - serviceCharges;
  const netSales = action
    ? 0
    : grossSales - valueAddedTax - totalDiscountsAmount - serviceCharges - otherCharges - otherTax;
  const firstTransaction = 1;
  // const lastTransaction = !fileExists?  1:parsedCsv.length + 1
  const lastTransaction = index + 1;
  const numberOfTransactions = lastTransaction - firstTransaction + 1;
  const beginInvoiceNumber = si_number?.si_number ?? cart.siNumber;
  const endInvoiceNumber = action !== 'void' ? cart.siNumber : lastSiNumber?.si_number;
  const serialNumber = snMin?.split('/')[0]?.trim() ?? '';

  const data = [
    aranetaMallCode ?? '', // Mall Code
    aranetaContractNumber ?? '', // Contract Number
    aranetaOpenField1 ?? '', // Open Field 1
    aranetaOpenField2 ?? '', // Open Field 2
    aranetaOutletNumber ?? '', // Outlet Number
    parseFloat(newGrandTotal).toFixed(2), // New Grand Total
    parseFloat(oldGrandTotal).toFixed(2), // Old Grand Total (OGT)
    aranetaSalesType ?? '', // Sales Type
    netSales.toFixed(2), // Net Sales
    action ? (0).toFixed(2) : totalDiscounts.regular.total.toFixed(2), // Regular Discount
    action ? (0).toFixed(2) : totalDiscounts.employee.total.toFixed(2), // Employee Discount
    action ? (0).toFixed(2) : totalDiscounts.scd.total.toFixed(2), // Senior Citizen Discount
    action ? (0).toFixed(2) : totalDiscounts.vip.total.toFixed(2), // VIP Discount
    action ? (0).toFixed(2) : totalDiscounts.pwd.total.toFixed(2), // PWD Discount
    action ? (0).toFixed(2) : totalDiscounts.other.total.toFixed(2), // Other Discount
    (0).toFixed(2), // Open Field 3
    (0).toFixed(2), // Open Field 4
    (0).toFixed(2), // Open Field 5
    (0).toFixed(2), // Open Field 6
    (0).toFixed(2), // Open Field 7
    action ? (0).toFixed(2) : parseFloat(totalSales.toFixed(2)), // Total Sales
    action ? (0).toFixed(2) : parseFloat(valueAddedTax.toFixed(2)), // Value Added Tax
    (0).toFixed(2), // Other Tax
    (0).toFixed(2), // Adjustments
    (0).toFixed(2), // Positive Adjustments
    (0).toFixed(2), // Negative Adjustments
    (0).toFixed(2), // Non Tax Positive Adjustments
    (0).toFixed(2), // Non Tax Negative Adjustments
    action ? (0).toFixed(2) : parseFloat(grossSales.toFixed(2)), // Gross Sales
    action === 'void' ? parseFloat(cart.amounts.noPayment).toFixed(2) : (0).toFixed(2), // Void
    action === 'refund' || action === 'return'
      ? parseFloat(cart.amounts.noPayment).toFixed(2)
      : (0).toFixed(2), // Refund
    action ? (0).toFixed(2) : parseFloat(vatInclusiveSales.toFixed(2)), // Sales Inclusive of VAT (VS)
    action ? (0).toFixed(2) : parseFloat((nonVatSales + vatZeroRatedSales).toFixed(2)), // Non VAT Sales (NVS) / Zero rate VAT Sales (ZRS)
    action ? (0).toFixed(2) : totalPayments.charge.total.toFixed(2), // Charge Payment
    action ? (0).toFixed(2) : totalPayments.cash.total.toFixed(2), // Cash Payment
    action ? (0).toFixed(2) : totalPayments.gc.total.toFixed(2), // Gift Cheque
    action ? (0).toFixed(2) : totalPayments.debit.total.toFixed(2), // Debit Card
    action ? (0).toFixed(2) : totalPayments.other.total.toFixed(2), // Other Tender
    action ? (0).toFixed(2) : totalPayments.mastercard.total.toFixed(2), // Mastercard
    action ? (0).toFixed(2) : totalPayments.visa.total.toFixed(2), // Visa
    action ? (0).toFixed(2) : totalPayments.amex.total.toFixed(2), // American Express
    action ? (0).toFixed(2) : totalPayments.amex.total.toFixed(2), // Diners
    action ? (0).toFixed(2) : totalPayments.jcb.total.toFixed(2), // JCB
    (0).toFixed(2), // Other Card
    serviceCharges.toFixed(2), // Service Charge (SC)
    otherCharges.toFixed(2), // Other Charge (OC)
    firstTransaction, // First Transaction
    lastTransaction, // Last Transaction
    numberOfTransactions, // Number of Transactions
    beginInvoiceNumber, // Beginning Invoice No
    endInvoiceNumber, // Ending Invoice No
    action ? 0 : totalPayments.cash.count, // Cash Transactions
    action ? 0 : totalPayments.gc.count, // Gift / Card Cheque Transactions
    action ? 0 : totalPayments.debit.count, // Debit Card Transactions
    action ? 0 : totalPayments.other.count, // Other Tender Transactions
    action ? 0 : totalPayments.mastercard.count, // Mastercard Transactions
    action ? 0 : totalPayments.visa.count, // Visa Transactions
    action ? 0 : totalPayments.amex.count, // American Express Transactions
    action ? 0 : totalPayments.diners.count, // Diners Transactions
    action ? 0 : totalPayments.jcb.count, // JCB Transactions
    0, // Other Card Transactions
    terminalNumber, // POS Number
    serialNumber, // Serial Number
    latestZRead?.data?.zReadData?.zReadLogsCount ?? 0, // Z-Count
    moment().format('hhmmss'), // Transaction Time
    `${moment(transactionDate).format('MMDDYYYY')}` // Transaction Date
  ];

  //   console.log("data ", data)

  return data;
}
