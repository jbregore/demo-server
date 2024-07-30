const CashLog = require('../../models/CashLog');
const PaymentLog = require('../../models/PaymentLog');
const DiscountLog = require('../../models/DiscountLog');
const TransactionAmount = require('../../models/TransactionAmount');
const moment = require('moment/moment');
const Transaction = require('../../models/Transaction');
const Order = require('../../models/Order');

exports.getCashierSales = async (req, res, next) => {
  try {
    const { employeeId: cashierId, branchCode, timeFrom, timeTo } = req.params;

    const [fromTxnDate, fromTxnTime] = moment(timeFrom)
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');
    const [toTxnDate, toTxnTime] = moment(timeTo)
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');

    const dateParams = {
      fromTxnDate,
      fromTxnTime,
      toTxnDate,
      toTxnTime
    };

    res.status(200).json({
      payments: await getPayments(branchCode, dateParams),
      totalDiscounts: await getTotalDiscounts(cashierId, branchCode, dateParams),
      discounts: await getDiscounts(cashierId, branchCode, dateParams),
      vat: await getVat(cashierId, branchCode, dateParams),
      initial: await getInitial(cashierId, branchCode, dateParams),
      takeoutCash: await getTakeoutCash(cashierId, branchCode, dateParams),
      specs: await getSpecs(cashierId, branchCode, dateParams),
      transactions: await getTransactions(cashierId, branchCode, dateParams)
    });
  } catch (err) {
    console.log("err ", err)
    return res.status(400).json({ message: err.message });
  }
};

exports.getCashiers = async (req, res, next) => {
  try {
    const { transactionDate, branchCode } = req.params;
    const splittedDate = transactionDate.split(' ')[0];

    const [fromTxnDate, fromTxnTime] = moment(splittedDate)
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');
    const [toTxnDate, toTxnTime] = moment(splittedDate)
      .endOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
      .split(' ');

    let query = { type: 'initial' };

    query.branchCode = branchCode;

    query.cashDate = {
      $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
      $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
    };

    const cashiers = await CashLog.aggregate([
      { $match: query },
      {
        $project: {
          cashier_id: '$employeeId',
          cashier_first_name: '$cashierFirstName',
          cashier_last_name: '$cashierLastName'
        }
      }
    ]);

    res.status(200).json({ cashiers });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

const getPayments = async (branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  console.log("test ",)
  let query = {};

  query.storeCode = branchCode;
  query.paymentDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };

  const payments = await PaymentLog.aggregate([
    { $match: query },
    {
      $project: {
        payment_log_id: '$paymentLogId',
        type: 1,
        amount: 1,
        excess_gift_card_type: '$excessGiftCardType',
        excess_gift_card_amount: '$excessGiftCardAmount',
        excess_cash: '$excessCash',
        excess_rmes: '$excessRmes',
        currency: 1,
        status: 1,
        method: 1,
        txn_number: '$txnNumber',
        cashier_id: '$cashierId',
        store_code: '$storeCode',
        payment_date: '$paymentDate',
        date_created: '$createdAt',
        date_updated: '$updatedAt'
      }
    }
  ]);

  return payments;
};

const getTotalDiscounts = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let pipeline = [];

  pipeline.push({
    $match: {
      employeeId: cashierId,
      storeCode: branchCode,
      discountDate: {
        $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
        $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
      }
    }
  });

  pipeline.push({
    $group: {
      _id: '$discount',
      totalAmount: { $sum: '$amount' },
      totalCount: { $sum: 1 },
      discountName: { $first: '$discount' }
    }
  });

  return await DiscountLog.aggregate(pipeline);
};

const getDiscounts = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let query = {};

  query.storeCode = branchCode;
  query.discountDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;

  const discounts = await DiscountLog.aggregate([
    { $match: query },
    {
      $project: {
        amount: 1,
        discount: 1,
        txn_number: '$txnNumber'
      }
    }
  ]);

  return discounts;
};

const getVat = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;
  let query = {};

  query.storeCode = branchCode;
  query.transactionDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;

  const vats = await TransactionAmount.aggregate([
    { $match: query },
    {
      $project: {
        vatable_sale: '$vatableSale',
        vat_amount: '$vatAmount',
        vat_exempt: '$vatExempt',
        vat_zero_rated: '$vatZeroRated',
        non_vat: '$nonVat',
        total_amount: '$totalAmount',
        txn_number: '$txnNumber'
      }
    }
  ]);

  return vats;
};

const getInitial = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let query = {};

  query.branchCode = branchCode;
  query.cashDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;
  query.type = 'initial';

  const initial = await CashLog.aggregate([
    { $match: query },
    {
      $project: {
        total: 1,
        cashier_first_name: '$cashierFirstName',
        cashier_last_name: '$cashierLastName',
        shift: '$shift'
      }
    }
  ]);

  return initial[0] ?? null;
};

const getTakeoutCash = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let query = {};

  query.branchCode = branchCode;
  query.cashDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;
  query.type = 'cash takeout';

  const takeOutCash = await CashLog.aggregate([
    { $match: query },
    {
      $project: {
        total: 1,
        cashier_first_name: '$cashierFirstName',
        cashier_last_name: '$cashierLastName',
        shift: '$shift'
      }
    }
  ]);

  return takeOutCash[0] ?? null;
};

const getSpecs = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let query = {};

  query.storeCode = branchCode;
  query.paymentDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;


  const orders = await Order.aggregate([
    {
      $match: {
        ...query,
        status: { $ne: "for payment" },
      }
    },
    {
      $unwind: "$products"
    },
    {
      $group: {
        _id: {
          txnNumber: "$txnNumber",
          status: "$status"
        },
        quantity: { $sum: "$products.quantity" },
      }
    },
    {
      $project: {
        txn_number: "$_id.txnNumber",
        status: "$_id.status",
        quantity: 1,
        _id: 0
      }
    }
  ]);

  return orders ?? null;
}

const getTransactions = async (cashierId, branchCode, dateParams) => {
  const { fromTxnDate, fromTxnTime, toTxnDate, toTxnTime } = dateParams;

  let query = {};

  query.storeCode = branchCode;
  query.transactionDate = {
    $gte: new Date(`${fromTxnDate}T${fromTxnTime}Z`),
    $lte: new Date(`${toTxnDate}T${toTxnTime}Z`)
  };
  query.employeeId = cashierId;

  const sortOptions = {};
  sortOptions['siNumber'] = 1;

  const transactions = await Transaction.aggregate([
    { $match: query },
    { $sort: sortOptions },
    {
      $project: {
        txn_number: '$txnNumber',
        amount: 1,
        cashier_id: '$employeeId',
        store_code: '$storeCode',
        type: 1,
        si_number: '$siNumber',
        void_number: '$voidNumber',
        transaction_date: '$transactionDate',
        date_created: '$createdAt',
        date_updated: '$updatedAt'
      }
    }
  ]);

  return transactions ?? null;
};
