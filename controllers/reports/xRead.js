const HttpError = require('../../middleware/http-error');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const mongoose = require('mongoose');
const Preview = require('../../models/Preview');
const Order = require('../../models/Order');
const PaymentLog = require('../../models/PaymentLog');
const DiscountLog = require('../../models/DiscountLog');
const TransactionAmount = require('../../models/TransactionAmount');
const { SettingsCategoryEnum } = require('../common/settingsData');
const Transaction = require('../../models/Transaction');
const CashLog = require('../../models/CashLog');
const ReadLog = require('../../models/ReadLog');
const { formatDate } = require('../../services/cash-logs/common');
const { generateNextActivityNumber } = require('../common/transaction');
const uniqid = require('uniqid');
const ActivityLog = require('../../models/ActivityLog');
const { printXReadService } = require('../../services/readings/xReadService');

exports.getXReadData = async (req, res, next) => {
  const { employeeId, timeFrom, timeTo, transactionDate } = req.params;
  const posDate = transactionDate.split(' ')[0];
  const currentDate = moment().format('YYYY-MM-DD');
  const startTime = moment().startOf('day').format('HH:mm:ss');
  const endTime = moment().endOf('day').format('HH:mm:ss');

  const cashierFilter = {
    employeeId: employeeId,
    // createdAt: {
    //   $gte: new Date(`${currentDate}T${timeFrom}`), // No need to remove timezone since this was fetched from mongodb with the correct time.
    //   $lte: new Date(`${currentDate}T${timeTo}Z`)
    // }
  };
  console.log(`Cashier filter is `, cashierFilter);

  const dateFilter = {
    $gte: new Date(`${posDate}T${startTime}Z`),
    $lte: new Date(`${posDate}T${endTime}Z`),
  };

  try {

    /** START OF QUERIES */
    // Get all non-sales payments
    const getNonSalesTxns = async (status = ['void', 'refund', 'return']) => {
      const nonSalesTxns = (await Order.find(
        {
          paymentDate: dateFilter,
          status: { $in: status },
          ...cashierFilter
        },
        { txnNumber: 1, _id: 0 }
      )).map((txn) => txn.txnNumber);

      return nonSalesTxns;
    };

    // Get all RMES payments  
    const rmesPaymentTxns = (
      await PaymentLog.find(
        {
          method: 'RMES',
          paymentDate: dateFilter
        },
        { _id: 0, txnNumber: 1, amount: 1 }
      )
    ).map((txn) => txn.txnNumber);

    const voidReturnedTxns = await getNonSalesTxns(['void', 'return']);
    const voidRefundedReturnedTxns = await getNonSalesTxns(['void', 'refund', 'return']);

    // Get all payments methods
    const successPayments = reduceToObject(await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            customPaymentKey: {
              $regex: /^(?!CUSTOM::).*$/,
            },
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns] }
          }
        },
        {
          $group: {
            _id: "$method",
            count: { $sum: 1 },
            total: { $sum: "$amount" }
          }
        }
      ]
    ), '_id');

    const successCashPayments = reduceToObject(await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            customPaymentKey: {
              $regex: /^(?!CUSTOM::).*$/,
            },
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns] },
            status: 'success',
            method: "Cash"
          }
        },
        {
          $group: {
            _id: "$method",
            count: { $sum: 1 },
            total: { $sum: "$amount" }
          }
        }
      ]
    ), '_id');

    const successCustomPayments = reduceToObject(await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            customPaymentKey: {
              $regex: /^CUSTOM::.*$/,
            },
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns] }
          }
        },
        {
          $group: {
            _id: "$method",
            title: { $first: "$method" },
            count: { $sum: 1 },
            total: { $sum: "$amount" },
            key: { $first: "$customPaymentKey" }
          }
        }
      ]
    ), '_id')

    const customCashPayments = [];
    const customNonCashPayments = [];

    for (const method in successCustomPayments) {
      if (successCustomPayments[method].key.startsWith('CUSTOM::c_')) {
        customCashPayments.push(successCustomPayments[method]);
      } else if (successCustomPayments[method].key.startsWith('CUSTOM::nc_')) {
        customNonCashPayments.push(successCustomPayments[method]);
      }
    }

    const nonVoidAndRefundPayments = await PaymentLog.countDocuments({
      ...cashierFilter,
      paymentDate: dateFilter,
      status: { $nin: ['void', 'refund'] },
    });

    // Get all refunds, returns, regulars, and voids from transactions collection
    const transactions = reduceToObject(await Transaction.aggregate(
      [
        {
          $match: {
            transactionDate: dateFilter,
            ...cashierFilter
          }
        },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
            siNumbers: {
              $push: {
                $first: {
                  $split: ['$siNumber', '-']
                }
              }
            }
          }
        }
      ]
    ), '_id');

    const [noOfSalesTxn] = await Transaction.aggregate([
      {
        $match: {
          type: 'regular',
          transactionDate: dateFilter,
          ...cashierFilter,
          txnNumber: { $nin: voidRefundedReturnedTxns }
        }
      },
      {
        $count: "count"
      }
    ])

    const [noOfNonSalesTxn] = await Transaction.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [
                { type: { $ne: 'regular' } },
                { txnNumber: { $in: voidRefundedReturnedTxns } }
              ]
            },
            { transactionDate: dateFilter },
          ],
          ...cashierFilter,
        }
      },
      {
        $count: "count"
      }
    ])

    // Get all discounts
    const allDiscounts = await DiscountLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            discountDate: dateFilter,
            txnNumber: { $nin: [...voidRefundedReturnedTxns, ...rmesPaymentTxns] }
          }
        },
        {
          $group: {
            _id: "$receiptLabel",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
            receiptLabel: { $first: '$receiptLabel' },
            discount: { $first: '$discount' }
          }
        }
      ]
    );

    // Get all vat details
    const [vatDetails] = await TransactionAmount.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            transactionDate: dateFilter,
            txnNumber: { $nin: [...voidRefundedReturnedTxns] }
          }
        },
        {
          $group: {
            _id: null,
            totalVatableSales: { $sum: "$vatableSale" },
            totalVatAmount: { $sum: "$vatAmount" },
            totalVatExempt: { $sum: "$vatExempt" },
            totalVatZeroRated: { $sum: "$vatZeroRated" },
            totalAmount: { $sum: "$totalAmount" },
            totalNonVat: { $sum: "$nonVat" }
          }
        }
      ]
    );

    // Get all nonVat Sales count
    const [nonVatSalesCount] = await TransactionAmount.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            transactionDate: dateFilter,
            txnNumber: { $nin: [...voidRefundedReturnedTxns, ...rmesPaymentTxns] },
            $or:
              [
                { vatExempt: { $gt: 0 } },
                { vatZeroRated: { $gt: 0 } },
              ]
          }
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
          }
        }
      ]
    );

    // Get all GC by type
    const gcByType = await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns, ...rmesPaymentTxns] },
            $or: [
              {
                customPaymentKey: {
                  $regex: /^CUSTOM::gc_.*$/,
                },
              },
              {
                $and: [
                  {
                    customPaymentKey: {
                      $regex: /^(?!CUSTOM::).*$/,
                    },
                  },
                  {
                    method: {
                      $nin: [
                        'Cash',
                        'Card (Mastercard)',
                        'Card (EPS)',
                        'GCash',
                        'GCash QR',
                        'Lalamove',
                        'Maya',
                        'Maya QR',
                        'PayMongo',
                        'PayPal',
                        'LBC',
                        'WSI',
                        'Payo',
                        'Consegnia',
                        'Atome',
                        'RMES',
                        'Card (BDO Credit)',
                        'Card (BDO Debit)',
                        'Card (Maya Credit)',
                        'Card (Maya Debit)',
                      ]
                    }
                  }
                ]
              }
            ]
          }
        },
        {
          $group: {
            _id: "$type",
            key: { $first: "$customPaymentKey" },
            count: { $sum: 1 },
            total: { $sum: { $add: ["$amount", "$excessCash"] } },
            type: { $first: "$type" }
          }
        }
      ]
    );

    const gcByMethod = await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns, ...rmesPaymentTxns] },
            $or: [
              {
                customPaymentKey: {
                  $regex: /^CUSTOM::gc_.*$/,
                },
              },
              {
                $and: [
                  {
                    customPaymentKey: {
                      $regex: /^(?!CUSTOM::).*$/,
                    },
                  },
                  {
                    method: {
                      $nin: [
                        'Cash',
                        'Card (Mastercard)',
                        'Card (EPS)',
                        'GCash',
                        'GCash QR',
                        'Lalamove',
                        'Maya',
                        'Maya QR',
                        'PayMongo',
                        'PayPal',
                        'LBC',
                        'WSI',
                        'Payo',
                        'Consegnia',
                        'Atome',
                        'RMES',
                        'Card (BDO Credit)',
                        'Card (BDO Debit)',
                        'Card (Maya Credit)',
                        'Card (Maya Debit)',
                      ]
                    }
                  }
                ]
              }
            ]
          }
        },
        {
          $group: {
            _id: "$method",
            key: { $first: "$customPaymentKey" },
            count: { $sum: 1 },
            total: { $sum: { $add: ["$amount", "$excessCash"] } },
          }
        }
      ]
    );

    // Get excess cash and gift card amounts 
    const [excessCashGc] = await PaymentLog.aggregate([
      {
        $match: {
          ...cashierFilter,
          paymentDate: dateFilter,
          txnNumber: { $nin: [...voidReturnedTxns, ...rmesPaymentTxns] }
        }
      },
      {
        $group: {
          _id: null,
          totalCash: { $sum: '$excessCash' },
          totalGiftCardAmount: { $sum: '$excessGiftCardAmount' }
        }
      }
    ]);

    // Get Cash Reports 
    const initialCashLog = await CashLog.findOne({
      type: 'initial',
      cashDate: dateFilter,
      ...cashierFilter
    });

    console.log("dateFilter ", dateFilter)
    const cashTakeOutLog = await CashLog.findOne(
      {
        type: 'cash takeout',
        cashDate: dateFilter,
        ...cashierFilter
      }
    );

    const [[cancelledItems], [suspendedTxns], [soldItems], returnedByCategory, soldByCategory, [prevDayRefunds]] = await Promise.all(
      [
        // Get all cancelled items
        Order.aggregate(
          [
            {
              '$match': {
                orderDate: dateFilter,
                ...cashierFilter
              }
            },
            {
              '$unwind': {
                'path': '$products'
              }
            }, {
              '$match': {
                'products.status': 'cancelled',
              }
            }, {
              '$group': {
                '_id': '$products.status',
                'count': { '$sum': 1 },
                'total': { '$sum': '$products.price' }
              }
            }
          ]
        ),

        // Get all suspended transactions
        Order.aggregate(
          [
            {
              '$match': {
                'status': 'suspend',
                orderDate: dateFilter,
                ...cashierFilter
              }
            }, {
              '$count': 'count'
            }
          ]
        ),

        // Get all sold items via paid orders 
        Order.aggregate(
          [
            {
              '$match': {
                'status': 'paid',
                paymentDate: dateFilter,
                ...cashierFilter
              }
            },
            {
              '$lookup': {
                from: 'payment logs',
                localField: 'paymentMethods',
                foreignField: '_id',
                as: 'paymentLogs'
              }
            },
            {
              '$match': {
                'paymentLogs.method': { $ne: 'RMES' }
              }
            },
            {
              '$unwind': {
                'path': '$products'
              }
            },
            {
              '$match': {
                'products.status': 'paid'
              }
            },
            {
              '$count': 'count'
            }
          ]
        ),

        // Get all returned items by category
        Order.aggregate(
          [
            {
              '$match': {
                'status': 'return'
              }
            }, {
              '$unwind': {
                'path': '$products'
              }
            }, {
              '$match': {
                'products.status': {
                  '$in': [
                    'paid', 'return'
                  ]
                }
              }
            }, {
              '$group': {
                '_id': '$products.category',
                'total': {
                  '$sum': '$products.price'
                },
                'count': {
                  '$sum': 1
                }
              }
            }, {
              '$lookup': {
                'from': 'categories',
                'localField': '_id',
                'foreignField': '_id',
                'as': 'category'
              }
            }, {
              '$unwind': {
                'path': '$category'
              }
            }
          ]
        ),

        // Get all sold items by category
        Order.aggregate(
          [
            {
              '$match': {
                'status': 'paid',
                paymentDate: dateFilter,
                ...cashierFilter
              }
            },
            {
              '$unwind': {
                'path': '$products'
              }
            },
            {
              '$match': {
                'products.status': 'paid'
              }
            },
            {
              '$group': {
                '_id': '$products.category',
                'total': {
                  '$sum': '$products.price'
                },
                'count': {
                  '$sum': 1
                }
              }
            }, {
              '$lookup': {
                'from': 'categories',
                'localField': '_id',
                'foreignField': '_id',
                'as': 'category'
              }
            }, {
              '$unwind': {
                'path': '$category'
              }
            }
          ]
        ),

        // Get previous day transactions that were refunded
        Transaction.aggregate(
          [
            {
              '$match': {
                'transactionDate': dateFilter,
                'type': 'refund'
              }
            }, {
              '$addFields': {
                'origSiNumber': {
                  '$first': {
                    '$split': [
                      '$siNumber', '-'
                    ]
                  }
                }
              }
            }, {
              '$lookup': {
                'from': 'transactions',
                'localField': 'origSiNumber',
                'foreignField': 'siNumber',
                'as': 'origTxn'
              }
            }, {
              '$lookup': {
                'from': 'payment logs',
                'localField': 'origTxn.txnNumber',
                'foreignField': 'txnNumber',
                'as': 'paymentLog'
              }
            }, {
              '$addFields': {
                'paymentLog': {
                  '$first': '$paymentLog'
                }
              }
            }, {
              '$addFields': {
                'paymentDay': {
                  '$dayOfMonth': '$paymentLog.paymentDate'
                },
                'refundDay': {
                  '$dayOfMonth': '$transactionDate'
                }
              }
            }, {
              '$match': {
                '$expr': {
                  '$gt': [
                    '$refundDay', '$paymentDay'
                  ]
                }
              }
            }, {
              '$group': {
                '_id': null,
                'total': {
                  '$sum': '$amount'
                }
              }
            }
          ]
        )
      ]
    );

    const [sameDayCustomCashRefunds] = await PaymentLog.aggregate(
      [
        {
          $match: {
            ...cashierFilter,
            customPaymentKey: {
              $regex: /^CUSTOM::c_.*$/,
            },
            paymentDate: dateFilter,
            txnNumber: { $nin: [...voidReturnedTxns] },
            status: 'refund'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: "$amount" },
          }
        }
      ]
    );

    const [prevDayCashRefunds] = await Transaction.aggregate(
      [
        {
          '$match': {
            'transactionDate': dateFilter,
            'type': 'refund'
          }
        }, {
          '$addFields': {
            'origSiNumber': {
              '$first': {
                '$split': [
                  '$siNumber', '-'
                ]
              }
            }
          }
        }, {
          '$lookup': {
            'from': 'transactions',
            'localField': 'origSiNumber',
            'foreignField': 'siNumber',
            'as': 'origTxn'
          }
        }, {
          '$lookup': {
            'from': 'payment logs',
            'localField': 'origTxn.txnNumber',
            'foreignField': 'txnNumber',
            'as': 'paymentLog'
          }
        },

        {
          '$addFields': {
            'paymentLog': {
              '$first': '$paymentLog'
            }
          }
        },
        {
          '$match': {
            '$or': [
              {
                'paymentLog.method': 'Cash'
              },
              {
                'paymentLog.customPaymentKey': {
                  '$regex': /^CUSTOM::c_.*$/
                }
              }
            ]
          }
        },
        {
          '$addFields': {
            'paymentDay': {
              '$dayOfMonth': '$paymentLog.paymentDate'
            },
            'refundDay': {
              '$dayOfMonth': '$transactionDate'
            }
          }
        }, {
          '$match': {
            '$expr': {
              '$gt': [
                '$refundDay', '$paymentDay'
              ]
            }
          }
        }, {
          '$group': {
            '_id': null,
            'total': {
              '$sum': '$amount'
            }
          }
        }
      ]
    )
    
    const [returnedCashPaymentsNotInRmes] = await Transaction.aggregate([
      {
        // txnObj[]: transactions where type = 'return'
        $match: {
          type: 'return',
          transactionDate: dateFilter,
          ...cashierFilter,
        }
      },
      {
        // txnObj.origSiNumber = txnObj.siNumber.split('-')[0]
        $addFields: {
          origSiNumber: {
            $first: {
              $split: [
                '$siNumber', '-'
              ]
            }
          }
        }
      },
      {
        // txnObj.origTxn[] = `transactions` where siNumber == txnObj.origSiNumber
        $lookup: {
          from: 'transactions',
          localField: 'origSiNumber',
          foreignField: 'siNumber',
          as: 'origTxn'
        }
      },
      {
        // txnObj.paymentLog[] = [`payment logs` where txnNumber == txnObj.origTxn[].txnNumber]
        $lookup: {
          from: 'payment logs',
          localField: 'origTxn.txnNumber',
          foreignField: 'txnNumber',
          as: 'paymentLog'
        }
      },
      {
        // txnObj where txnObj.paymentLog[].method == 'Cash' or custom cash
        $match: {
          '$or': [
              {
                'paymentLog.method': 'Cash'
              },
              {
                'paymentLog.customPaymentKey': {
                  '$regex': /^CUSTOM::c_.*$/
                }
              }
            ]
        }
      },
      {
        // txnObj.preview[] = `previews` where data.cart.payments.siNumber == txnObj.siNumber
        $lookup: {
          from: 'previews',
          localField: 'siNumber',
          foreignField: 'data.cart.payments.siNumber',
          as: 'preview'
        }
      },
      // txnObj where txnObj.preview == [] or txnObj.preview == null/undefined
      {
        $match: {
          $or: [
            {
              'preview': {
                $size: 0
              }
            },
            {
              'preview': {
                $exists: false
              }
            }
          ]
        }
      },
      // x.total = sum(txnObj.amount) // negative amount because it is a return
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]);

    const items = [];
    /* eslint-disable */
    let totalItemCount = 0;
    let totalItemAmount = 0;
    /* eslint-enable */

    // Deduct returns from items sold
    soldByCategory.forEach((item) => {
      const returnedItem = returnedByCategory.find((returnItem) => returnItem.category.name === item.category.name);
      if (returnedItem) {
        items.push({
          category: item.category.name,
          count: item.count - returnedItem.count,
          total: item.total - returnedItem.total
        });
      } else {
        items.push({
          category: item.category.name,
          count: item.count,
          total: item.total
        });
      }
    });

    items.forEach((item) => {
      totalItemCount += item.count;
      totalItemAmount += item.total;
    });

    // Add returned items that were not sold
    returnedByCategory.forEach((returnedItem) => {
      const item = soldByCategory.find((item) => item.category.name === returnedItem.category.name);
      if (!item) {
        items.push({
          category: returnedItem.category.name,
          count: returnedItem.count * -1,
          total: returnedItem.total * -1
        });
      }
    });

    let returnedItems = [];
    let returnedItemsTotal = 0;
    let returnedItemsCount = 0;
    // Get returned items if there are returned transactions
    if (transactions?.return?.siNumbers) {
      const returns = await Order.aggregate(
        [
          {
            '$match': {
              'siNumber': {
                '$in': transactions?.return?.siNumbers
              }
            }
          }, {
            '$unwind': {
              'path': '$products'
            }
          }, {
            '$match': {
              'products.status': {
                '$in': [
                  'paid', 'return'
                ]
              }
            }
          }, {
            '$group': {
              '_id': '$products.productCode',
              'productCode': {
                '$first': '$products.productCode'
              },
              'total': {
                '$sum': '$products.price'
              },
              'count': {
                '$sum': 1
              }
            }
          }
        ]
      );

      returns.forEach((item) => {
        returnedItemsCount += item.count;
        returnedItemsTotal += item.total;
      });

      returnedItems = returns;
    }

    // Get first and last void numbers and si numbers
    const [[firstVoid], [lastVoid], [firstSi], [lastSi]] = await Promise.all([
      Transaction.find(
        {
          transactionDate: dateFilter,
          ...cashierFilter,
          type: 'void',
        },
        {
          _id: 0,
          voidNumber: 1
        }
      ).sort({ transactionDate: 1 }).limit(1),
      Transaction.find(
        {
          transactionDate: dateFilter,
          ...cashierFilter,
          type: 'void',
        },
        {
          _id: 0,
          voidNumber: 1
        }
      ).sort({ transactionDate: -1 }).limit(1),
      Transaction.find(
        {
          transactionDate: dateFilter,
          ...cashierFilter,
          // type: 'regular',
          siNumber: { $exists: true, $ne: '' }
        },
        {
          _id: 0,
          siNumber: 1
        }
      )
        .sort({ transactionDate: 1 }).limit(1),
      Transaction.find(
        {
          transactionDate: dateFilter,
          ...cashierFilter,
          siNumber: { $exists: true, $ne: '' }
        },
        {
          _id: 0,
          siNumber: 1
        }
      ).sort({ transactionDate: -1 }).limit(1),
    ]);

    /** END OF QUERIES */
    const countDenominations = cashTakeOutLog.peso1000 +
      cashTakeOutLog.peso500 +
      cashTakeOutLog.peso200 +
      cashTakeOutLog.peso100 +
      cashTakeOutLog.peso50 +
      cashTakeOutLog.peso20 +
      cashTakeOutLog.peso10 +
      cashTakeOutLog.peso5 +
      cashTakeOutLog.peso1 +
      cashTakeOutLog.cent25 +
      cashTakeOutLog.cent10 +
      cashTakeOutLog.cent05 +
      cashTakeOutLog.cent01;

    cashTakeOutLog.countDenominations = countDenominations;

    let totalGcPayment = 0;
    let totalGcCount = 0;
    // Total Gift Card Used
    const totalGCUsed = gcByType.reduce((sum, gc) => {
      // Also add to totalGcCount to get the total amount of GC Payment used
      totalGcCount += gc.count;

      return sum + gc.total;
    }, 0);

    // Subtract the excess cash and excess gift card amount to totalGCUsed to get the net payment amount of gift card
    totalGcPayment = totalGCUsed - (excessCashGc?.totalCash ?? 0) - (excessCashGc?.totalGiftCardAmount ?? 0);

    /** 
     * Calculate for all discounts
     */

    // List all the discounts for filtering in calculating discounts (use Sets for O(1) time complexity)
    const vatDiscountsList = new Set(['VAT', 'VATZR', 'VATEX', 'VAT EX', 'DPLMTS']);
    const specialDiscountsList = new Set(['SCD', 'SCD-5%', 'PWD', 'PNSTMD']);

    let discounts = {
      totalRegularDiscounts: { count: 0, total: 0 },
      totalSpecialDiscounts: { count: 0, total: 0 },
      totalItemDiscounts: { count: 0, total: 0 },
      totalVatDiscounts: { count: 0, total: 0 }
    };
    let allDiscountsWithoutVAT = [];

    allDiscounts.forEach((discount) => {
      if (!vatDiscountsList.has(discount._id)) {
        discounts.totalItemDiscounts.total += discount.total;
        discounts.totalItemDiscounts.count += discount.count;
        allDiscountsWithoutVAT.push(discount);
      } else {
        discounts.totalVatDiscounts.total += discount.total;
        discounts.totalVatDiscounts.count += discount.count;
      }

      if (!vatDiscountsList.has(discount._id) || !specialDiscountsList.has(discount._id)) {
        discounts.totalRegularDiscounts.total += discount.total;
        discounts.totalRegularDiscounts.count += discount.count;
      }

      if (specialDiscountsList.has(discount._id)) {
        discounts.totalSpecialDiscounts.total += discount.total;
        discounts.totalSpecialDiscounts.count += discount.count;
      }
    });

    /** 
   * Calculate NET Sales and GROSS Sales
   */

    const totalNetSales = (vatDetails?.totalVatableSales ?? 0)
      + (vatDetails?.totalVatAmount ?? 0)
      + (vatDetails?.totalVatExempt ?? 0)
      + (vatDetails?.totalVatZeroRated ?? 0)
      + (vatDetails?.totalNonVat ?? 0)
      + (prevDayRefunds?.total ?? 0)
      + (transactions.return?.total ?? 0); // Deduct returns without exchange from 

    const totalGrossSales = totalNetSales + discounts.totalItemDiscounts.total;

    /** 
     * Get other transaction stats
     */

    /* eslint-disable */
    let totalNonSalesTxn = 0;
    let totalTxn = 0;
    /* eslint-enable */

    Object.keys(transactions).forEach((key) => {
      if (key !== 'regular') {
        totalNonSalesTxn += transactions[key].count;
      }
      totalTxn += transactions[key].count;
    });

    /**
     * Get total success payments for average basket 
     */

    const TOTAL_IN_DRAWER = initialCashLog.total + (successCashPayments?.Cash?.total ?? 0) + totalGcPayment + (returnedCashPaymentsNotInRmes?.total ?? 0) + sum(customCashPayments, 'total') + (prevDayCashRefunds?.total ?? 0) - (sameDayCustomCashRefunds?.total ?? 0);
    const TOTAL_CASH_DECLARATION = cashTakeOutLog?.total;
    const TOTAL_COUNT_DENOMINATIONS = countDenominations;

    const gcPayments = totalGcPayment + (excessCashGc?.totalCash ?? 0) + (excessCashGc?.totalGiftCardAmount ?? 0)
    const FINAL_TOTAL = TOTAL_CASH_DECLARATION + gcPayments - (excessCashGc?.totalGiftCardAmount ?? 0);
    const OVER_SHORT = TOTAL_CASH_DECLARATION - (initialCashLog.total + (successCashPayments?.Cash?.total ?? 0) + (returnedCashPaymentsNotInRmes?.total ?? 0) + sum(customCashPayments, 'total') + (prevDayCashRefunds?.total ?? 0) - (excessCashGc?.totalCash ?? 0) - (sameDayCustomCashRefunds?.total ?? 0));

    const [paymentsTxnAmount] = await PaymentLog.aggregate([
      {
        $match: {
          paymentDate: dateFilter,
          ...cashierFilter,
          txnNumber: { $nin: voidRefundedReturnedTxns }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: { $add: ["$amount", "$excessCash"] } },
        }
      },
      {
        $project: {
          _id: 0,
          total: 1
        }
      }
    ])

    const basketDivisor = noOfSalesTxn ? noOfSalesTxn?.count : 0;
    // eslint-disable-next-line
    const AVERAGE_BASKET = ((paymentsTxnAmount?.total - (excessCashGc?.totalGiftCardAmount ?? 0) - (excessCashGc?.totalCash ?? 0)) / basketDivisor) ?? 0;

    const xReadData = {
      payments: {
        cash: {
          total: successPayments?.Cash?.total ?? 0,
          count: successPayments?.Cash?.count ?? 0,
        },
        cashOnDelivery: {
          LALAMOVE: {
            total: successPayments?.Lalamove?.total ?? 0,
            count: successPayments?.Lalamove?.count ?? 0,
          },
          LBC: {
            total: successPayments?.LBC?.total ?? 0,
            count: successPayments?.LBC?.count ?? 0,
          },
          PAYO: {
            total: successPayments?.Payo?.total ?? 0,
            count: successPayments?.Payo?.count ?? 0,
          },
          CONSEGNIA: {
            total: successPayments?.Consegnia?.total ?? 0,
            count: successPayments?.Consegnia?.count ?? 0,
          },
          WSI: {
            total: successPayments?.WSI?.total ?? 0,
            count: successPayments?.WSI?.count ?? 0,
          },
          summary: {
            total: (successPayments?.Lalamove?.total ?? 0) + (successPayments?.LBC?.total ?? 0) + (successPayments?.Payo?.total ?? 0) + (successPayments?.WSI?.total ?? 0) + (successPayments?.Consegnia?.total ?? 0),
            count: (successPayments?.Lalamove?.count ?? 0) + (successPayments?.LBC?.count ?? 0) + (successPayments?.Payo?.count ?? 0) + (successPayments?.WSI?.count ?? 0) + (successPayments?.Consegnia?.count ?? 0),
          }
        },
        nonCash: {
          cards: {
            CREDIT_CARD: {
              total: successPayments['Card (Mastercard)']?.total ?? 0,
              count: successPayments['Card (Mastercard)']?.count ?? 0,
            },
            DEBIT_CARD: {
              total: successPayments['Card (EPS)']?.total ?? 0,
              count: successPayments['Card (EPS)']?.count ?? 0,
            },
            "BDO CREDIT": {
              total: successPayments['Card (BDO Credit)']?.total ?? 0,
              count: successPayments['Card (BDO Credit)']?.count ?? 0,
            },
            "BDO DEBIT": {
              total: successPayments['Card (BDO Debit)']?.total ?? 0,
              count: successPayments['Card (BDO Debit)']?.count ?? 0,
            },
            "MAYA CREDIT": {
              total: successPayments['Card (Maya Credit)']?.total ?? 0,
              count: successPayments['Card (Maya Credit)']?.count ?? 0,
            },
            "MAYA DEBIT": {
              total: successPayments['Card (Maya Debit)']?.total ?? 0,
              count: successPayments['Card (Maya Debit)']?.count ?? 0,
            },
            summary: {
              total: (successPayments['Card (EPS)']?.total ?? 0) + (successPayments['Card (Mastercard)']?.total ?? 0)
                + (successPayments['Card (BDO Credit)']?.total ?? 0) + (successPayments['Card (BDO Debit)']?.total ?? 0)
                + (successPayments['Card (Maya Credit)']?.total ?? 0) + (successPayments['Card (Maya Debit)']?.total ?? 0),
              count: (successPayments['Card (EPS)']?.count ?? 0) + (successPayments['Card (Mastercard)']?.count ?? 0)
                + (successPayments['Card (BDO Credit)']?.count ?? 0) + (successPayments['Card (BDO Debit)']?.count ?? 0)
                + (successPayments['Card (Maya Credit)']?.count ?? 0) + (successPayments['Card (Maya Debit)']?.count ?? 0),
            }
          },
          eWallets: {
            GCASH: {
              total: successPayments?.GCash?.total ?? 0,
              count: successPayments?.GCash?.count ?? 0,
            },
            "GCASH QR": {
              total: successPayments["GCash QR"]?.total ?? 0,
              count: successPayments["GCash QR"]?.count ?? 0,
            },
            MAYA: {
              total: successPayments?.Maya?.total ?? 0,
              count: successPayments?.Maya?.count ?? 0,
            },
            "MAYA QR": {
              total: successPayments["Maya QR"]?.total ?? 0,
              count: successPayments["Maya QR"]?.count ?? 0,
            },
            PAYMONGO: {
              total: successPayments?.PayMongo?.total ?? 0,
              count: successPayments?.PayMongo?.count ?? 0,
            },
            PAYPAL: {
              total: successPayments?.PayPal?.total ?? 0,
              count: successPayments?.PayPal?.count ?? 0,
            },
            summary: {
              total: (successPayments?.GCash?.total ?? 0) + (successPayments["GCash QR"]?.total ?? 0) + (successPayments?.Maya?.total ?? 0)
                + (successPayments["Maya QR"]?.total ?? 0) + (successPayments?.PayMongo?.total ?? 0) + (successPayments?.PayPal?.total ?? 0),
              count: (successPayments?.GCash?.count ?? 0) + (successPayments["GCash QR"]?.count ?? 0) + (successPayments?.Maya?.count ?? 0)
                + (successPayments["Maya QR"]?.count ?? 0) + (successPayments?.PayMongo?.count ?? 0) + (successPayments?.PayPal?.count ?? 0),
            }
          },
          giftCards: {
            GC_ITEMS_TYPES: gcByType,
            GC_ITEMS_METHODS: gcByMethod,
            summary: {
              EXCESS_GC_AMOUNT: excessCashGc?.totalGiftCardAmount ?? 0,
              EXCESS_CASH_AMOUNT: excessCashGc?.totalCash ?? 0,
              EXCESS_GC: (excessCashGc?.totalCash ?? 0) + (excessCashGc?.totalGiftCardAmount ?? 0),
              total: totalGcPayment,
              count: totalGcCount,
            }
          },
          returns: {
            RMES_ISSUANCE: {
              total: transactions.return?.total ?? 0,
              count: transactions.return?.count ?? 0,
            },
            RMES_REDEMPTION: {
              total: successPayments?.RMES?.total ?? 0,
              count: successPayments?.RMES?.count ?? 0,
            }
          },
          others: {
            ATOME: {
              total: successPayments?.Atome?.total ?? 0,
              count: successPayments?.Atome?.count ?? 0,
            },
            summary: {
              total: successPayments?.Atome?.total ?? 0,
              count: successPayments?.Atome?.count ?? 0,
            }
          },
          summary: {
            total: (successPayments['Card (EPS)']?.total ?? 0)
              + (successPayments['Card (Mastercard)']?.total ?? 0)
              + (successPayments?.GCash?.total ?? 0)
              + (successPayments["GCash QR"]?.total ?? 0)
              + (successPayments?.Maya?.total ?? 0)
              + (successPayments["Maya QR"]?.total ?? 0)
              + (successPayments?.PayMongo?.total ?? 0)
              + (successPayments?.PayPal?.total ?? 0)
              + totalGcPayment
              + (transactions.return?.total ?? 0)
              + (transactions.refund?.total ?? 0)
              + (successPayments?.RMES?.total ?? 0)
              + (successPayments?.Atome?.total ?? 0)
              + (successPayments['Card (BDO Credit)']?.total ?? 0) + (successPayments['Card (BDO Debit)']?.total ?? 0)
              + (successPayments['Card (Maya Credit)']?.total ?? 0) + (successPayments['Card (Maya Debit)']?.total ?? 0),
            count: (successPayments['Card (EPS)']?.count ?? 0)
              + (successPayments['Card (Mastercard)']?.count ?? 0)
              + (successPayments?.GCash?.count ?? 0)
              + (successPayments["GCash QR"]?.count ?? 0)
              + (successPayments?.Maya?.count ?? 0)
              + (successPayments["Maya QR"]?.count ?? 0)
              + (successPayments?.PayMongo?.count ?? 0)
              + (successPayments?.PayPal?.count ?? 0)
              + totalGcCount
              + (transactions.return?.count ?? 0)
              + (transactions.refund?.count ?? 0)
              + (successPayments?.RMES?.count ?? 0)
              + (successPayments?.Atome?.count ?? 0)
              + (successPayments['Card (BDO Credit)']?.count ?? 0) + (successPayments['Card (BDO Debit)']?.count ?? 0)
              + (successPayments['Card (Maya Credit)']?.count ?? 0) + (successPayments['Card (Maya Debit)']?.count ?? 0),
          }
        },
        custom: {
          cash: {
            data: customCashPayments,
            summary: {
              total: sum(customCashPayments, 'total'),
              count: sum(customCashPayments, 'count'),
            }
          },
          nonCash: {
            data: customNonCashPayments,
            summary: {
              total: sum(customNonCashPayments, 'total'),
              count: sum(customNonCashPayments, 'count'),
            }
          },
        },
        summary: {
          total: (successPayments?.Cash?.total ?? 0)
            + (successPayments?.Lalamove?.total ?? 0)
            + (successPayments?.LBC?.total ?? 0)
            + (successPayments?.Payo?.total ?? 0)
            + (successPayments?.WSI?.total ?? 0)
            + (successPayments?.Consegnia?.total ?? 0)
            + (successPayments['Card (EPS)']?.total ?? 0)
            + (successPayments['Card (Mastercard)']?.total ?? 0)
            + (successPayments?.GCash?.total ?? 0)
            + (successPayments["GCash QR"]?.total ?? 0)
            + (successPayments?.Maya?.total ?? 0)
            + (successPayments["Maya QR"]?.total ?? 0)
            + (successPayments?.PayMongo?.total ?? 0)
            + (successPayments?.PayPal?.total ?? 0)
            + totalGcPayment
            + (transactions.return?.total ?? 0)
            + (transactions.refund?.total ?? 0)
            + (successPayments?.RMES?.total ?? 0)
            + (successPayments?.Atome?.total ?? 0)
            + (successPayments['Card (BDO Credit)']?.total ?? 0) + (successPayments['Card (BDO Debit)']?.total ?? 0)
            + (successPayments['Card (Maya Credit)']?.total ?? 0) + (successPayments['Card (Maya Debit)']?.total ?? 0)
            + sum(customCashPayments, 'total')
            + sum(customNonCashPayments, 'total'),
          count: nonVoidAndRefundPayments
            + (transactions.return?.count ?? 0)
            + (transactions.refund?.count ?? 0)
          // count:  
          // (successPayments?.Cash?.count ?? 0) 
          // + (successPayments?.Lalamove?.count ?? 0) 
          // + (successPayments?.LBC?.count ?? 0) 
          // + (successPayments?.Payo?.count ?? 0) 
          // + (successPayments?.WSI?.count ?? 0) 
          // + (successPayments?.Consegnia?.count ?? 0)
          // + (successPayments['Card (EPS)']?.count ?? 0) 
          // + (successPayments['Card (Mastercard)']?.count ?? 0)
          // + (successPayments?.GCash?.count ?? 0) 
          // + (successPayments["GCash QR"]?.count ?? 0)
          // + (successPayments?.Maya?.count ?? 0) 
          // + (successPayments["Maya QR"]?.count ?? 0)
          // + (successPayments?.PayMongo?.count ?? 0) 
          // + (successPayments?.PayPal?.count ?? 0)
          // + totalGcCount
          // + (transactions.return?.count ?? 0)
          // + (transactions.refund?.count ?? 0)
          // + (successPayments?.RMES?.count ?? 0)
          // + (successPayments?.Atome?.count ?? 0)
          // + (successPayments['Card (BDO Credit)']?.count ?? 0) + (successPayments['Card (BDO Debit)']?.count ?? 0) 
          // + (successPayments['Card (Maya Credit)']?.count ?? 0) + (successPayments['Card (Maya Debit)']?.count ?? 0),
        }
      },
      discounts: {
        DISCOUNT_ITEMS: allDiscountsWithoutVAT,
        REGULAR_DISCOUNTS: {
          ...discounts.totalRegularDiscounts
        },
        SPECIAL_DISCOUNTS: {
          ...discounts.totalSpecialDiscounts
        },
        summary: {
          ...discounts.totalItemDiscounts
        }
      },
      vat: {
        count: nonVatSalesCount?.count ?? 0,
        total: discounts.totalVatDiscounts.total,
        VAT_DETAILS: {
          vatableSales: vatDetails?.totalVatableSales ?? '0',
          vatAmount: vatDetails?.totalVatAmount ?? '0',
          vatExemptSales: vatDetails?.totalVatExempt ?? '0',
          vatZeroRated: vatDetails?.totalVatZeroRated ?? '0',
          nonVatable: vatDetails?.totalNonVat ?? '0'
        }
      },
      returns: {
        RETURNED_ITEMS: returnedItems,
        summary: {
          total: returnedItemsTotal,
          count: returnedItemsCount
        }
      },
      department: {
        CATEGORIES: items,
        summary: {
          count: sum(items, 'count'),
          total: sum(items, 'total')
        }
      },
      initialFund: {
        INITIAL_FUND: {
          id: initialCashLog._id,
          cashierId: initialCashLog.employeeId,
          total: initialCashLog.total,
          cashDate: initialCashLog.cashDate,
          shift: initialCashLog.shift
        },
        total: 0
      },
      takeout: cashTakeOutLog,
      cashDrop: {
        TOTAL_IN_DRAWER,
        totalDeclaration: {
          cash: {
            TOTAL_CASH_DECLARATION,
            TOTAL_COUNT_DENOMINATIONS
          },
          giftCard: {
            count: totalGcCount,
            amount: totalGcPayment,
            GIFT_CARD_CHANGE: (excessCashGc?.totalGiftCardAmount ?? 0)
          }
        }
      },
      FINAL_TOTAL,
      OVER_SHORT,
      cashierAudit: {
        NUM_ITEMS_SOLD: soldItems?.count ?? 0,
        NUM_SALES_TXN: noOfSalesTxn?.count ?? 0,
        NUM_NON_SALES_TXN: noOfNonSalesTxn?.count ?? 0,
        NUM_TOTAL_TXN: totalTxn,
        NUM_CANCELLED_TXN: cancelledItems?.count ?? 0,
        CANCELLED_TXN_AMOUNT: cancelledItems?.total ?? 0,
        NUM_SUSPENDED_TXN: suspendedTxns?.count ?? 0,
        NUM_VOID_TXN: transactions?.void?.count ?? 0,
        VOID_TXN_AMOUNT: transactions?.void?.total ?? 0,
        NUM_REFUND_TXN: transactions?.refund?.count ?? 0,
        REFUND_TXN_AMOUNT: transactions?.refund?.total ?? 0,
        TOTAL_DEPOSIT_AMOUNT: initialCashLog.total,
        TOTAL_DISCOUNT_AMOUNT: discounts.totalItemDiscounts.total,
        AVE_BASKET: AVERAGE_BASKET
      },
      SI_NUM: {
        from: firstSi?.siNumber ?? '',
        to: lastSi?.siNumber ?? ''
      },
      VOID_NUM: {
        from: firstVoid?.voidNumber ?? '',
        to: lastVoid?.voidNumber ?? ''
      },
      SALES: {
        gross: totalGrossSales,
        net: totalNetSales,
      }
    };

    return res.status(200).json({ data: xReadData });

  } catch (err) {
    console.log(err);
    const error = new HttpError('Failed to get x-read data. Please try again.', 500);
    return next(error);
  }
};


exports.printXRead = async (req, res, next) => {
  let { apiData, settings } = req.body;

  const { xReadData, cashier, isReprint } = apiData;

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
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  const printSinglePayment = (data, label) => {
    printer.println(`*** ${label} ***`);

    printer.leftRight(`${label} (${data.count})`, fCurrency('', roundUpAmount(data.total)));

    printer.leftRight(`TOTAL ${label} (${data.count})`, fCurrency('', roundUpAmount(data.total)));
  };

  const {
    SI_NUM,
    payments,
    discounts,
    vat,
    department,
    initialFund,
    takeout,
    cashDrop,
    FINAL_TOTAL,
    OVER_SHORT,
    cashierAudit,
    SALES
  } = xReadData;

  printer.newLine();
  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
  printer.println(
    xReadData.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);

  printer.newLine();
  printer.println('X-Reading');
  printer.println(`POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);
  isReprint && printer.println('(REPRINT)');

  printer.newLine();
  printer.println(
    `SHIFT ${initialFund.INITIAL_FUND.shift} of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id
    }`
  );
  // printer.println(
  //   `SHIFT ${initialFund.INITIAL_FUND[0] && initialFund.INITIAL_FUND[0].shift
  //   } of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id}`
  // );

  printer.println(
    `Store code: ${settings[SettingsCategoryEnum.UnitConfig].storeCode}`
  );

  printer.println(
    `Transaction date: ${moment(initialFund.INITIAL_FUND.cashDate).format('MM/DD/YYYY')}`
  );

  printer.println(`From: ${moment(cashier.shiftFrom).utc().format('MM/DD/YYYY - hh:mm A')}`);
  printer.leftRight(`To: ${moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A')}`, 'PHP');

  printer.drawLine();
  printer.leftRight('Payment (Count)', 'Amount');

  printer.alignCenter();

  if (payments.cash.count > 0) {
    printer.println('*** CASH ***');
    printer.leftRight(
      `CASH PESO (${payments.cash.count})`,
      fCurrency('', roundUpAmount(payments.cash.total))
    );

    printer.leftRight(
      `TOTAL CASH PESO (${payments.cash.count})`,
      fCurrency('', roundUpAmount(payments.cash.total))
    );
  }

  if (payments.cashOnDelivery?.summary?.count > 0) {
    if (payments.cashOnDelivery?.LALAMOVE?.count > 0) {
      printer.println('*** LALAMOVE ***');
      printer.leftRight(
        `LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
      printer.leftRight(
        `TOTAL LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
    }

    if (payments.cashOnDelivery?.LBC?.count > 0) {
      printer.println('*** LBC ***');
      printer.leftRight(
        `LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
      printer.leftRight(
        `TOTAL LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
    }

    if (payments.cashOnDelivery?.PAYO?.count > 0) {
      printer.println('*** PAYO ***');
      printer.leftRight(
        `PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
      printer.leftRight(
        `TOTAL PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
    }

    if (payments.cashOnDelivery?.WSI?.count > 0) {
      printer.println('*** WSI ***');
      printer.leftRight(
        `WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
      printer.leftRight(
        `TOTAL WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
    }

    if (payments.cashOnDelivery?.CONSEGNIA?.count > 0) {
      printer.println('*** CONSEGNIA ***');
      printer.leftRight(
        `CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency(
          '',
          roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total)
        )
      );
      printer.leftRight(
        `TOTAL CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total))
      );
    }
  }

  // custom cash methods
  if (payments.custom?.cash?.summary?.count > 0) {
    payments.custom?.cash?.data?.forEach((item) => {
      printSinglePayment(item, item.title.toUpperCase());
    })
  }

  if (payments.nonCash.cards.CREDIT_CARD.count > 0) {
    printer.println('*** CREDIT CARD ***');
    printer.leftRight(
      `MASTER CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
    );
    printer.leftRight(
      `TOTAL CREDIT CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
    );
  }

  if (payments.nonCash.cards.DEBIT_CARD.count > 0) {
    printer.println('*** DEBIT CARD ***');
    printer.leftRight(
      `EPS (${payments.nonCash.cards.DEBIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.DEBIT_CARD.total))
    );
    printer.leftRight(
      `TOTAL DEBIT CARD (${payments.nonCash.cards.DEBIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.DEBIT_CARD.total))
    );
  }

  for (const label of Object.keys(payments.nonCash.cards)) {
    if (['CREDIT_CARD', 'DEBIT_CARD', 'summary'].includes(label)) continue;

    if (payments.nonCash.cards[label]?.count > 0) {
      printSinglePayment(payments.nonCash.cards[label], label);
    }
  }

  if (xReadData.version === '2.0') {
    if (
      payments.nonCash.eWallets.GCASH.count +
      payments.nonCash.eWallets.MAYA.count +
      (payments.nonCash.eWallets.PAYPAL?.count || 0) +
      (payments.nonCash.eWallets.PAYMONGO?.count || 0) >
      0
    ) {
      printer.println('*** E-WALLET ***');

      if (payments.nonCash.eWallets.GCASH.count > 0) {
        printer.leftRight(
          `GCASH (${payments.nonCash.eWallets.GCASH.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.GCASH.total))
        );
      }

      if (payments.nonCash.eWallets.MAYA.count > 0) {
        printer.leftRight(
          `MAYA (${payments.nonCash.eWallets.MAYA.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.MAYA.total))
        );
      }

      if (payments.nonCash.eWallets.PAYMONGO?.count > 0) {
        printer.leftRight(
          `PAYMONGO (${payments.nonCash.eWallets.PAYMONGO.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYMONGO.total))
        );
      }

      if (payments.nonCash.eWallets.PAYPAL?.count > 0) {
        printer.leftRight(
          `PAYPAL (${payments.nonCash.eWallets.PAYPAL.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYPAL.total))
        );
      }

      printer.leftRight(
        `TOTAL E-WALLET (${payments.nonCash.eWallets.GCASH.count +
        payments.nonCash.eWallets.MAYA.count +
        (payments.nonCash.eWallets.PAYPAL?.count || 0) +
        (payments.nonCash.eWallets.PAYMONGO?.count || 0)
        })`,
        fCurrency(
          '',
          roundUpAmount(
            payments.nonCash.eWallets.GCASH.total +
            payments.nonCash.eWallets.MAYA.total +
            (payments.nonCash.eWallets.PAYPAL?.total || 0) +
            (payments.nonCash.eWallets.PAYMONGO?.total || 0)
          )
        )
      );
    }
  } else {
    // eWallets now their own payment methods
    for (const label of Object.keys(payments.nonCash.eWallets)) {
      if (label === 'summary') continue;

      if (payments.nonCash.eWallets[label]?.count > 0) {
        printSinglePayment(payments.nonCash.eWallets[label], label);
      }
    }

    // other noncash methods
    for (const label of Object.keys(payments.nonCash.others)) {
      if (label === 'summary') continue;

      if (payments.nonCash.others[label]?.count > 0) {
        printSinglePayment(payments.nonCash.others[label], label);
      }
    }

    // custom noncash methods
    if (payments.custom?.nonCash?.summary?.count > 0) {
      payments.custom?.nonCash?.data?.forEach((item) => {
        printSinglePayment(item, item.title.toUpperCase());
      })
    }
  }

  if (payments.nonCash.returns.RMES_ISSUANCE.count > 0) {
    printer.println('*** RETURN ***');
    printer.leftRight(
      `RETURN WITHIN 30 DAYS (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
    );
    printer.leftRight(
      `TOTAL RETURN (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
    );
  }

  if (payments.nonCash.returns.RMES_REDEMPTION.count > 0) {
    printer.println('*** EXCHANGE ***');
    printer.leftRight(
      `EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
    );
    printer.leftRight(
      `TOTAL EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
    );
  }

  if (payments.nonCash.giftCards.summary.count > 0) {
    printer.println('*** GIFT CARD ***');

    payments.nonCash.giftCards.GC_ITEMS_METHODS.forEach((gift) => {
      printer.leftRight(
        `${gift._id.toUpperCase()} (${gift.count})`,
        fCurrency('', roundUpAmount(gift.total))
      );
    });

    if (payments.nonCash.giftCards.summary.EXCESS_GC > 0) {
      printer.leftRight(
        'EXCESS GC',
        fCurrency('-', roundUpAmount(payments.nonCash.giftCards.summary.EXCESS_GC))
      );
    }

    printer.leftRight(
      `TOTAL GIFT CARD (${payments.nonCash.giftCards.summary.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.giftCards.summary.total))
    );
  }

  if (cashierAudit.NUM_REFUND_TXN && cashierAudit.REFUND_TXN_AMOUNT) {
    printer.println('*** REFUND ***');
    printer.leftRight(
      `REFUND (${cashierAudit.NUM_REFUND_TXN})`,
      fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT)),
    );
    printer.leftRight(
      `TOTAL REFUND (${cashierAudit.NUM_REFUND_TXN})`,
      fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
    );
  }

  printer.drawLine();
  printer.leftRight(
    `TOTAL (${payments.summary.count})`,
    fCurrency('', roundUpAmount(payments.summary.total))
  );
  printer.drawLine();

  printer.leftRight(
    `CASH (${payments.cash.count + (payments.cashOnDelivery?.summary?.count || 0) + (payments.custom?.cash?.summary?.count || 0)})`,
    fCurrency(
      '',
      roundUpAmount(payments.cash.total + (payments.cashOnDelivery?.summary?.total || 0) + (payments.custom?.cash?.summary?.total || 0))
    )
  );
  printer.leftRight(
    `NON CASH (${payments.nonCash.summary.count + (payments.custom?.nonCash?.summary?.count || 0)})`,
    fCurrency('', roundUpAmount(payments.nonCash.summary.total + (payments.custom?.nonCash?.summary?.total || 0)))
  );
  printer.drawLine();

  printer.leftRight('Discount (Count)', 'Amount');

  discounts.DISCOUNT_ITEMS.forEach((dc) => {
    const promoCodeLabel = dc.discount === 'PROMOCODE' ? dc.receiptLabel : dc.discount;

    printer.leftRight(
      `${dc.discount === 'SCD' ? 'SCD-20%' : promoCodeLabel} (${dc.count})`,
      fCurrency('', roundUpAmount(dc.total))
    );
  });

  printer.drawLine();

  printer.leftRight(
    `TOTAL Discount (${discounts.summary.count})`,
    fCurrency('', roundUpAmount(discounts.summary.total))
  );
  printer.drawLine();

  printer.leftRight('VAT of ZR & VE (Count)', 'Amount');
  printer.leftRight(
    `VAT (${xReadData.isNonVat ? 0 : vat.count})`,
    xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    `TOTAL VAT (${xReadData.isNonVat ? 0 : vat.count})`,
    xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    'VATable Sales',
    fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatableSales)
  );
  printer.leftRight('VAT', fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatAmount));
  printer.leftRight('VAT-Exempt Sales', fCurrency('', vat.VAT_DETAILS.vatExemptSales));
  printer.leftRight(
    'VAT-Zero Rated Sales',
    fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatZeroRated)
  );
  printer.leftRight('Non-VAT', fCurrency('', vat.VAT_DETAILS.nonVatable));
  printer.drawLine();

  printer.leftRight('TOTAL NET SALES', fCurrency('', roundUpAmount(SALES.net)));
  printer.drawLine();

  printer.leftRight('Category (Count)', 'Amount');

  department.CATEGORIES.forEach((mat) => {
    printer.leftRight(
      ` ${mat.category === 'null' ? 'NO DESC' : mat.category} (${mat.count})`,
      fCurrency('', roundUpAmount(mat.total))
    );
  });

  printer.drawLine();

  printer.leftRight(
    `TOTAL (${department.summary.count})`,
    fCurrency('', roundUpAmount(department.summary.total))
  );
  printer.drawLine();

  printer.alignLeft();
  printer.println('INITIAL FUND');
  printer.leftRight(
    cashier.id,
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.leftRight(
    'TOTAL',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.leftRight(
    'CASH DEPOSIT AMT',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.drawLine();
  printer.drawLine();

  printer.alignCenter();
  printer.println('- - - SUBTRACT - - -');
  printer.alignLeft();
  printer.println('CASH DROP');
  printer.drawLine();
  printer.drawLine();
  printer.leftRight(
    'TOTAL IN DRAWER',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(cashDrop.TOTAL_IN_DRAWER) : '0.00')
  );
  printer.println('TOTAL DECLARATION');
  printer.leftRight(
    `CASH PESO (${cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS})`,
    fCurrency(
      '',
      takeout ? roundUpAmount(cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION) : '0.00'
    )
  );

  payments.nonCash.giftCards.GC_ITEMS_TYPES.forEach((gift) => {
    printer.leftRight(
      `${gift._id.toUpperCase()} (${gift.count})`,
      fCurrency('', roundUpAmount(gift.total))
    );
  });

  if (payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT.total > 0) {
    printer.leftRight(
      'GIFT CARD CHANGE',
      fCurrency('-', roundUpAmount(cashDrop.giftCard.GIFT_CARD_CHANGE))
    );
  }

  printer.drawLine();

  printer.leftRight('TOTAL', fCurrency('', takeout ? roundUpAmount(FINAL_TOTAL) : '0.00'));
  printer.leftRight('OVER/SHORT', fCurrency('', roundUpAmount(OVER_SHORT)));
  printer.drawLine();

  printer.alignCenter();
  printer.println(`CASHIER'S AUDIT`);
  printer.leftRight('No. of Items Sold', cashierAudit.NUM_ITEMS_SOLD);
  printer.leftRight('No. of Sales Txn', cashierAudit.NUM_SALES_TXN);
  printer.leftRight('No. of Non Sales Txn', cashierAudit.NUM_NON_SALES_TXN);
  printer.leftRight('Total Txn', cashierAudit.NUM_TOTAL_TXN);
  printer.leftRight('No. of Cancelled Txn', cashierAudit.NUM_CANCELLED_TXN);
  printer.leftRight(
    'Cancelled Txn. Amt',
    fCurrency('', roundUpAmount(cashierAudit.CANCELLED_TXN_AMOUNT))
  );
  printer.leftRight('No. of Suspended Txn', cashierAudit.NUM_SUSPENDED_TXN);
  printer.leftRight('No. of Void Txn', cashierAudit.NUM_VOID_TXN);
  printer.leftRight('Void Txn. Amt', fCurrency('', roundUpAmount(cashierAudit.VOID_TXN_AMOUNT)));
  printer.leftRight(
    'No. of Refund Txn',
    cashierAudit.NUM_REFUND_TXN ? cashierAudit.NUM_REFUND_TXN : 0
  );
  printer.leftRight(
    'Refund Txn. Amt',
    fCurrency(
      '',
      roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT ? cashierAudit.REFUND_TXN_AMOUNT : 0)
    )
  );
  printer.leftRight(
    'Discount Amt',
    fCurrency('', roundUpAmount(cashierAudit.TOTAL_DISCOUNT_AMOUNT))
  );
  printer.leftRight(
    'Deposit Amt',
    fCurrency('', roundUpAmount(cashierAudit.TOTAL_DEPOSIT_AMOUNT))
  );
  printer.leftRight('Ave. Basket', fCurrency('', roundUpAmount(cashierAudit.AVE_BASKET)));
  printer.drawLine();
  printer.newLine();
  printer.alignLeft();
  printer.println('Beginning SI No.');
  printer.println(SI_NUM.from);
  printer.println('Ending SI No.');
  printer.println(SI_NUM.to);
  printer.println('GENERATED ON');
  printer.println(moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A'));
  printer.println('Authorized By');
  printer.println(
    `${cashier.firstname.toUpperCase()} ${cashier.lastname.toUpperCase()} (${cashier.id})`
  );

  printer.newLine();
  printer.alignCenter();
  printer.println('Umbra Digital Company');
  printer.println('930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines');
  printer.println(`VAT REG TIN: ${settings.birInformation.vatReg}`);
  printer.println(
    `Accreditation: ${settings.birInformation.accr} Date issued: ${settings.birInformation.accrDateIssued}`
  );
  printer.println(
    `PTU No. ${settings.unitConfiguration.permit} Date issued: ${settings.unitConfiguration.ptuDateIssued}`
  );

  printer.newLine();
  printer.println('Thank you for shopping');
  printer.println(`Visit us at ${settings.companyInformation.companyWebsiteLink}`);

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

exports.createReadLog = async (req, res, next) => {
  const { reportReadLogId, cashierId, storeCode, type, readDate } = req.body;

  try {
    const newReadLog = new ReadLog(
      {
        reportReadLogId: reportReadLogId,
        employeeId: cashierId,
        storeCode,
        type,
        readDate
      }
    );

    await newReadLog.save();

    return res.status(200).json({ message: "Created." });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};


exports.generateXRead = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const { previewPayload, activityPayload, xReadLogPayload, printPayload, fromOutofSync = false } = req.body;

      //create preview
      const { date: previewDate, time: previewTime } = formatDate(previewPayload.transactionDate);
      await Preview.create(
        [
          {
            txnNumber: previewPayload.txnNumber,
            type: previewPayload.type,
            storeCode: previewPayload.storeCode,
            transactionDate: new Date(`${previewDate}T${previewTime}Z`),
            data: previewPayload.data
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
            description: activityPayload.description,
            action: activityPayload.action,
            storeCode: activityPayload.storeCode,
            activityDate: new Date(`${activityDate}T${activityTime}Z`)
          }
        ],
        { session }
      );

      //read-log
      const { date: xReadLogDate, time: xReadLogTime } = formatDate(xReadLogPayload.readDate);
      await ReadLog.create(
        [
          {
            reportReadLogId: xReadLogPayload.reportReadLogId,
            employeeId: xReadLogPayload.cashierId,
            storeCode: xReadLogPayload.storeCode,
            type: xReadLogPayload.type,
            readDate: new Date(`${xReadLogDate}T${xReadLogTime}Z`)
          }
        ],
        { session }
      )

      if (!fromOutofSync) {
        //print
        await printXReadService(printPayload);
      }

    })

    return res.status(200).json({ message: 'Successfully processed x-read.' });

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
}

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};

const sum = (array, key) => {
  return array.reduce((a, b) => Number(a) + (Number(b[key]) || 0), 0);
};

const reduceToObject = (result, id) => {
  return result.reduce((prev, curr) => {
    return {
      ...prev,
      [`${curr[id]}`]: {
        total: curr.total,
        count: curr.count,
        ...curr
      }
    };
  }, {});
};
