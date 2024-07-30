const Preview = require('../../models/Preview');
const HttpError = require('../../middleware/http-error');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const Order = require('../../models/Order');
const PaymentLog = require('../../models/PaymentLog');
const { SettingsCategoryEnum } = require('../common/settingsData');

exports.getPeriodZreadTransactions = async (req, res, next) => {
  const { fromTransactionDate, toTransactionDate, storeCode } = req.params;
  const [startDate, startTime] = moment(fromTransactionDate).startOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ')
  const [endDate, endTime] = moment(toTransactionDate).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ')
  let transactions = [];

  try {
    transactions = await Preview.find(
      {
        type: 'z-read',
        storeCode: storeCode,
        transactionDate: {
          $gte: new Date(`${startDate}T${startTime}Z`),
          $lte: new Date(`${endDate}T${endTime}Z`)
        }
      },
      {},
      {
        sort: {
          transactionDate: 1
        }
      }
    ).maxTimeMS(300000);

  } catch (err) {
    const error = new HttpError('Failed to fetch transactions, please try again.', 500);
    return next(error);
  }

  const t = transactions;

  let PAYMENTS_TXN_AMOUNT = 0;
  try {
    const returnedPaymentTxnNumbers = await Order.distinct('txnNumber', {
      storeCode: storeCode,
      status: { $in: ['return', 'void', 'refund'] },
      paymentDate: { $gte: new Date(fromTransactionDate), $lte: new Date(toTransactionDate) }
    });

    const rmesPaymentTxnNumbers = await PaymentLog.distinct('txnNumber', {
      method: new RegExp('RMES', 'i'),
      paymentDate: { $gte: new Date(fromTransactionDate), $lte: new Date(toTransactionDate) },
      storeCode: storeCode
    });

    const totalReturnedPayments = await PaymentLog.aggregate([
      {
        $match: {
          storeCode: storeCode,
          paymentDate: { $gte: new Date(fromTransactionDate), $lte: new Date(toTransactionDate) },
          txnNumber: { $nin: [...returnedPaymentTxnNumbers, ...rmesPaymentTxnNumbers] }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    PAYMENTS_TXN_AMOUNT = totalReturnedPayments.length > 0 ? totalReturnedPayments[0].total : 0;;

  } catch (err) {
    const error = new HttpError('PAYMENTS TXN AMOUNT query failed, please try again.', 500);
    console.log(err);
    return next(error);
  }

  res.status(200).json({ data: t, PAYMENTS_TXN_AMOUNT });
};

exports.printPeriodicalZread = async (req, res, next) => {
  // const { transactions, fromTransactionDate, toTransactionDate, generatedDate, cashier } = req.body;
  let { apiData, settings } = req.body;

  // apiData = JSON.parse(apiData);
  // settings = JSON.parse(settings);

  const {
    transactions,
    PAYMENTS_TXN_AMOUNT,
    fromTransactionDate,
    toTransactionDate,
    generatedDate,
    cashier
  } = apiData;


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

    printer.leftRight(
      `${label} (${data.count})`,
      fCurrency('', roundUpAmount(data.total))
    );

    printer.leftRight(
      `TOTAL ${label} (${data.count})`,
      fCurrency('', roundUpAmount(data.total))
    );
  };

  // Sums the `count` and `total` of items with the same value of the specified `key`
  const aggregateItems = (arr, key) => {
    const aggregatedItems = [];

    arr.forEach((item) => {
      const index = aggregatedItems.findIndex((i) => i[key] === item[key]);

      if (index === -1) {
        aggregatedItems.push(item);
      } else {
        aggregatedItems[index].count += item.count;
        aggregatedItems[index].total += item.total;
      }
    });

    return aggregatedItems;
  };

  const aggregateTransactions = (txns) => {
    const getAverageBasket = (pTxns, totalPayments) => {
      const EXCESS_GC_AMOUNT = pTxns.reduce(
        (subtotal, curr) =>
          subtotal + curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT.total,
        Number(0)
      );
      const EXCESS_CASH_AMOUNT = pTxns.reduce(
        (subtotal, curr) =>
          subtotal +
          curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT.total,
        Number(0)
      );
      const NUM_SALES_TXN = pTxns.reduce(
        (subtotal, curr) => subtotal + curr.data.zReadData.cashierAudit.NUM_SALES_TXN,
        Number(0)
      );

      return (totalPayments - EXCESS_GC_AMOUNT - EXCESS_CASH_AMOUNT) / NUM_SALES_TXN;
    };

    const aggregatedTransactions = txns.reduce((prev, curr, i) => {
      return {
        data: {
          zReadData: {
            zReadLogsCount: i === txns.length - 1 ? curr.data.zReadData.zReadLogsCount : 0,
            totalCountReset:
              prev.data.zReadData.totalCountReset + curr.data.zReadData.totalCountReset,
            payments: {
              cash: {
                total:
                  prev.data.zReadData.payments.cash.total + curr.data.zReadData.payments.cash.total,
                count:
                  prev.data.zReadData.payments.cash.count + curr.data.zReadData.payments.cash.count
              },
              cashOnDelivery: {
                LALAMOVE: {
                  total: (prev.data.zReadData.payments.cashOnDelivery?.LALAMOVE?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.LALAMOVE?.total || 0),
                  count: (prev.data.zReadData.payments.cashOnDelivery?.LALAMOVE?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.LALAMOVE?.count || 0),
                },
                LBC: {
                  total: (prev.data.zReadData.payments.cashOnDelivery?.LBC?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.LBC?.total || 0),
                  count: (prev.data.zReadData.payments.cashOnDelivery?.LBC?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.LBC?.count || 0),
                },
                PAYO: {
                  total: (prev.data.zReadData.payments.cashOnDelivery?.PAYO?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.PAYO?.total || 0),
                  count: (prev.data.zReadData.payments.cashOnDelivery?.PAYO?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.PAYO?.count || 0),
                },
                WSI: {
                  total: (prev.data.zReadData.payments.cashOnDelivery?.WSI?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.WSI?.total || 0),
                  count: (prev.data.zReadData.payments.cashOnDelivery?.WSI?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.WSI?.count || 0),
                },
                summary: {
                  total: (prev.data.zReadData.payments.cashOnDelivery?.summary?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.summary?.total || 0),
                  count: (prev.data.zReadData.payments.cashOnDelivery?.summary?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.summary?.count || 0),
                }
              },
              nonCash: {
                cards: {
                  CREDIT_CARD: {
                    total:
                      prev.data.zReadData.payments.nonCash.cards.CREDIT_CARD.total +
                      curr.data.zReadData.payments.nonCash.cards.CREDIT_CARD.total,
                    count:
                      prev.data.zReadData.payments.nonCash.cards.CREDIT_CARD.count +
                      curr.data.zReadData.payments.nonCash.cards.CREDIT_CARD.count
                  },
                  DEBIT_CARD: {
                    total:
                      prev.data.zReadData.payments.nonCash.cards.DEBIT_CARD.total +
                      curr.data.zReadData.payments.nonCash.cards.DEBIT_CARD.total,
                    count:
                      prev.data.zReadData.payments.nonCash.cards.DEBIT_CARD.count +
                      curr.data.zReadData.payments.nonCash.cards.DEBIT_CARD.count
                  }
                },
                eWallets: {
                  GCASH: {
                    total:
                      prev.data.zReadData.payments.nonCash.eWallets.GCASH.total +
                      curr.data.zReadData.payments.nonCash.eWallets.GCASH.total,
                    count:
                      prev.data.zReadData.payments.nonCash.eWallets.GCASH.count +
                      curr.data.zReadData.payments.nonCash.eWallets.GCASH.count
                  },
                  MAYA: {
                    total:
                      prev.data.zReadData.payments.nonCash.eWallets.MAYA.total +
                      curr.data.zReadData.payments.nonCash.eWallets.MAYA.total,
                    count:
                      prev.data.zReadData.payments.nonCash.eWallets.MAYA.count +
                      curr.data.zReadData.payments.nonCash.eWallets.MAYA.count
                  },
                  PAYMONGO: {
                    total: (prev.data.zReadData.payments.nonCash.eWallets.PAYMONGO?.total || 0) + (curr.data.zReadData.payments.nonCash.eWallets.PAYMONGO?.total || 0),
                    count: (prev.data.zReadData.payments.nonCash.eWallets.PAYMONGO?.count || 0) + (curr.data.zReadData.payments.nonCash.eWallets.PAYMONGO?.count || 0),
                  },
                  PAYPAL: {
                    total: (prev.data.zReadData.payments.nonCash.eWallets.PAYPAL?.total || 0) + (curr.data.zReadData.payments.nonCash.eWallets.PAYPAL?.total || 0),
                    count: (prev.data.zReadData.payments.nonCash.eWallets.PAYPAL?.count || 0) + (curr.data.zReadData.payments.nonCash.eWallets.PAYPAL?.count || 0),
                  },
                  summary: {
                    total: (prev.data.zReadData.payments.cashOnDelivery?.summary?.total || 0) + (curr.data.zReadData.payments.cashOnDelivery?.summary?.total || 0),
                    count: (prev.data.zReadData.payments.cashOnDelivery?.summary?.count || 0) + (curr.data.zReadData.payments.cashOnDelivery?.summary?.count || 0),
                  }
                },
                giftCards: {
                  GC_ITEMS_TYPES: aggregateItems(
                    [
                      ...prev.data.zReadData.payments.nonCash.giftCards.GC_ITEMS_TYPES,
                      ...curr.data.zReadData.payments.nonCash.giftCards.GC_ITEMS_TYPES
                    ],
                    '_id'
                  ),
                  GC_ITEMS_METHODS: aggregateItems(
                    [
                      ...prev.data.zReadData.payments.nonCash.giftCards.GC_ITEMS_METHODS,
                      ...curr.data.zReadData.payments.nonCash.giftCards.GC_ITEMS_METHODS
                    ],
                    '_id'
                  ),
                  summary: {
                    EXCESS_GC_AMOUNT: {
                      total:
                        prev.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT
                          .total +
                        curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT
                          .total
                    },
                    EXCESS_CASH_AMOUNT: {
                      total:
                        prev.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT
                          .total +
                        curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT
                          .total
                    },
                    EXCESS_GC:
                      // EXCESS_GC_AMOUNT.total + EXCESS_CASH_AMOUNT.total
                      prev.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT
                        .total +
                      curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT
                        .total +
                      (prev.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT
                        .total +
                        curr.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT
                          .total),
                    total:
                      prev.data.zReadData.payments.nonCash.giftCards.summary.total +
                      curr.data.zReadData.payments.nonCash.giftCards.summary.total,
                    count:
                      prev.data.zReadData.payments.nonCash.giftCards.summary.count +
                      curr.data.zReadData.payments.nonCash.giftCards.summary.count
                  }
                },
                returns: {
                  RMES_ISSUANCE: {
                    amount:
                      prev.data.zReadData.payments.nonCash.returns.RMES_ISSUANCE.amount +
                      curr.data.zReadData.payments.nonCash.returns.RMES_ISSUANCE.amount,
                    count:
                      prev.data.zReadData.payments.nonCash.returns.RMES_ISSUANCE.count +
                      curr.data.zReadData.payments.nonCash.returns.RMES_ISSUANCE.count
                  },
                  RMES_REDEMPTION: {
                    total:
                      prev.data.zReadData.payments.nonCash.returns.RMES_REDEMPTION.total +
                      curr.data.zReadData.payments.nonCash.returns.RMES_REDEMPTION.total,
                    count:
                      prev.data.zReadData.payments.nonCash.returns.RMES_REDEMPTION.count +
                      curr.data.zReadData.payments.nonCash.returns.RMES_REDEMPTION.count
                  }
                },
                others: {
                  ATOME: {
                    total: (prev.data.zReadData.payments.nonCash.others?.ATOME?.total || 0) + (curr.data.zReadData.payments.nonCash.others?.ATOME?.total || 0),
                    count: (prev.data.zReadData.payments.nonCash.others?.ATOME?.count || 0) + (curr.data.zReadData.payments.nonCash.others?.ATOME?.count || 0),
                  },
                  summary: {
                    total: (prev.data.zReadData.payments.nonCash.others?.summary?.total || 0) + (curr.data.zReadData.payments.nonCash.others?.summary?.total || 0),
                    count: (prev.data.zReadData.payments.nonCash.others?.summary?.count || 0) + (curr.data.zReadData.payments.nonCash.others?.summary?.count || 0),
                  }
                },
                summary: {
                  total:
                    prev.data.zReadData.payments.nonCash.summary.total +
                    curr.data.zReadData.payments.nonCash.summary.total,
                  count:
                    prev.data.zReadData.payments.nonCash.summary.count +
                    curr.data.zReadData.payments.nonCash.summary.count
                }
              },
              custom: {
                cash: {
                  data: aggregateItems([
                    ...(prev.data.zReadData.payments.custom?.cash?.data || []),
                    ...(curr.data.zReadData.payments.custom?.cash?.data || []),
                  ], 'key'),
                  summary: {
                    total:
                      (prev.data.zReadData.payments.custom?.cash?.summary?.total || 0) +
                      (curr.data.zReadData.payments.custom?.cash?.summary?.total || 0),
                    count:
                      (prev.data.zReadData.payments.custom?.cash?.summary?.count || 0) +
                      (curr.data.zReadData.payments.custom?.cash?.summary?.count || 0)
                  }
                },
                nonCash: {
                  data: aggregateItems([
                    ...(prev.data.zReadData.payments.custom?.nonCash?.data || []),
                    ...(curr.data.zReadData.payments.custom?.nonCash?.data || []),
                  ], 'key'),
                  summary: {
                    total:
                      (prev.data.zReadData.payments.custom?.nonCash?.summary?.total || 0) +
                      (curr.data.zReadData.payments.custom?.nonCash?.summary?.total || 0),
                    count:
                      (prev.data.zReadData.payments.custom?.nonCash?.summary?.count || 0) +
                      (curr.data.zReadData.payments.custom?.nonCash?.summary?.count || 0)
                  }
                },
              },
              summary: {
                total:
                  prev.data.zReadData.payments.summary.total +
                  curr.data.zReadData.payments.summary.total,
                count:
                  prev.data.zReadData.payments.summary.count +
                  curr.data.zReadData.payments.summary.count
              }
            },
            discounts: {
              DISCOUNT_ITEMS: aggregateItems([
                ...prev.data.zReadData.discounts.DISCOUNT_ITEMS,
                ...curr.data.zReadData.discounts.DISCOUNT_ITEMS
              ], 'receiptLabel'),
              summary: {
                total:
                  prev.data.zReadData.discounts.summary.total +
                  curr.data.zReadData.discounts.summary.total,
                count:
                  prev.data.zReadData.discounts.summary.count +
                  curr.data.zReadData.discounts.summary.count
              }
            },
            vat: {
              count: prev.data.zReadData.vat.count + curr.data.zReadData.vat.count,
              total: prev.data.zReadData.vat.total + curr.data.zReadData.vat.total,
              VAT_DETAILS: {
                vatableSales:
                  prev.data.zReadData.vat.VAT_DETAILS.vatableSales +
                  curr.data.zReadData.vat.VAT_DETAILS.vatableSales,
                vatAmount:
                  prev.data.zReadData.vat.VAT_DETAILS.vatAmount +
                  curr.data.zReadData.vat.VAT_DETAILS.vatAmount,
                vatExemptSales:
                  prev.data.zReadData.vat.VAT_DETAILS.vatExemptSales +
                  curr.data.zReadData.vat.VAT_DETAILS.vatExemptSales,
                vatZeroRated:
                  prev.data.zReadData.vat.VAT_DETAILS.vatZeroRated +
                  curr.data.zReadData.vat.VAT_DETAILS.vatZeroRated,
                nonVatable:
                  prev.data.zReadData.vat.VAT_DETAILS.nonVatable +
                  curr.data.zReadData.vat.VAT_DETAILS.nonVatable
              }
            },
            department: {
              CATEGORIES: aggregateItems([
                ...prev.data.zReadData.department.CATEGORIES,
                ...curr.data.zReadData.department.CATEGORIES
              ], 'category'),
              summary: {
                total:
                  prev.data.zReadData.department.summary.total +
                  curr.data.zReadData.department.summary.total,
                count:
                  prev.data.zReadData.department.summary.count +
                  curr.data.zReadData.department.summary.count
              }
            },
            initialFund: {
              INITIAL_FUND: [
                ...prev.data.zReadData.initialFund.INITIAL_FUND,
                ...curr.data.zReadData.initialFund.INITIAL_FUND
              ],
              total: prev.data.zReadData.initialFund.total + curr.data.zReadData.initialFund.total
            },
            takeout: [...prev.data.zReadData.takeout, ...curr.data.zReadData.takeout],
            cashDrop: {
              TOTAL_IN_DRAWER:
                prev.data.zReadData.cashDrop.TOTAL_IN_DRAWER +
                curr.data.zReadData.cashDrop.TOTAL_IN_DRAWER,
              totalDeclaration: {
                cash: {
                  TOTAL_CASH_DECLARATION:
                    prev.data.zReadData.cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION +
                    curr.data.zReadData.cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION,
                  TOTAL_COUNT_DENOMINATIONS:
                    prev.data.zReadData.cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS +
                    curr.data.zReadData.cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS
                },
                giftCard: {
                  count:
                    prev.data.zReadData.cashDrop.totalDeclaration.giftCard.count +
                    curr.data.zReadData.cashDrop.totalDeclaration.giftCard.count,
                  amount:
                    prev.data.zReadData.cashDrop.totalDeclaration.giftCard.amount +
                    curr.data.zReadData.cashDrop.totalDeclaration.giftCard.amount,
                  GIFT_CARD_CHANGE:
                    Number(
                      prev.data.zReadData.cashDrop.totalDeclaration.giftCard.GIFT_CARD_CHANGE
                    ) +
                    Number(curr.data.zReadData.cashDrop.totalDeclaration.giftCard.GIFT_CARD_CHANGE)
                }
              }
            },
            FINAL_TOTAL: prev.data.zReadData.FINAL_TOTAL + curr.data.zReadData.FINAL_TOTAL,
            OVER_SHORT: prev.data.zReadData.OVER_SHORT + curr.data.zReadData.OVER_SHORT,
            cashierAudit: {
              NUM_ITEMS_SOLD:
                prev.data.zReadData.cashierAudit.NUM_ITEMS_SOLD +
                curr.data.zReadData.cashierAudit.NUM_ITEMS_SOLD,
              NUM_SALES_TXN:
                prev.data.zReadData.cashierAudit.NUM_SALES_TXN +
                curr.data.zReadData.cashierAudit.NUM_SALES_TXN,
              NUM_NON_SALES_TXN:
                prev.data.zReadData.cashierAudit.NUM_NON_SALES_TXN +
                curr.data.zReadData.cashierAudit.NUM_NON_SALES_TXN,
              NUM_TOTAL_TXN:
                prev.data.zReadData.cashierAudit.NUM_TOTAL_TXN +
                curr.data.zReadData.cashierAudit.NUM_TOTAL_TXN,
              NUM_CANCELLED_TXN:
                prev.data.zReadData.cashierAudit.NUM_CANCELLED_TXN +
                curr.data.zReadData.cashierAudit.NUM_CANCELLED_TXN,
              CANCELLED_TXN_AMOUNT:
                prev.data.zReadData.cashierAudit.CANCELLED_TXN_AMOUNT +
                curr.data.zReadData.cashierAudit.CANCELLED_TXN_AMOUNT,
              NUM_SUSPENDED_TXN:
                prev.data.zReadData.cashierAudit.NUM_SUSPENDED_TXN +
                curr.data.zReadData.cashierAudit.NUM_SUSPENDED_TXN,
              NUM_VOID_TXN:
                prev.data.zReadData.cashierAudit.NUM_VOID_TXN +
                curr.data.zReadData.cashierAudit.NUM_VOID_TXN,
              VOID_TXN_AMOUNT:
                prev.data.zReadData.cashierAudit.VOID_TXN_AMOUNT +
                curr.data.zReadData.cashierAudit.VOID_TXN_AMOUNT,
              NUM_REFUND_TXN:
                prev.data.zReadData.cashierAudit.NUM_REFUND_TXN +
                curr.data.zReadData.cashierAudit.NUM_REFUND_TXN,
              REFUND_TXN_AMOUNT:
                prev.data.zReadData.cashierAudit.REFUND_TXN_AMOUNT +
                curr.data.zReadData.cashierAudit.REFUND_TXN_AMOUNT,
              TOTAL_DEPOSIT_AMOUNT:
                prev.data.zReadData.cashierAudit.TOTAL_DEPOSIT_AMOUNT +
                curr.data.zReadData.cashierAudit.TOTAL_DEPOSIT_AMOUNT,
              TOTAL_DISCOUNT_AMOUNT:
                prev.data.zReadData.cashierAudit.TOTAL_DISCOUNT_AMOUNT +
                curr.data.zReadData.cashierAudit.TOTAL_DISCOUNT_AMOUNT,
              AVE_BASKET: getAverageBasket(txns, PAYMENTS_TXN_AMOUNT)
            },
            SI_NUM: {
              from: prev.data.zReadData.SI_NUM.from
                ? prev.data.zReadData.SI_NUM.from
                : curr.data.zReadData.SI_NUM.from,
              to: curr.data.zReadData.SI_NUM.to
                ? curr.data.zReadData.SI_NUM.to
                : prev.data.zReadData.SI_NUM.to
            },
            VOID_NUM: {
              from: prev.data.zReadData.VOID_NUM.from
                ? prev.data.zReadData.VOID_NUM.from
                : curr.data.zReadData.VOID_NUM.from,
              to: curr.data.zReadData.VOID_NUM.to
                ? curr.data.zReadData.VOID_NUM.to
                : prev.data.zReadData.VOID_NUM.to
            },
            SALES: {
              gross: prev.data.zReadData.SALES.gross + curr.data.zReadData.SALES.gross,
              net: prev.data.zReadData.SALES.net + curr.data.zReadData.SALES.net
            },
            ACCUMULATED_SALES: {
              old:
                i === 0
                  ? curr.data.zReadData.ACCUMULATED_SALES.old
                  : prev.data.zReadData.ACCUMULATED_SALES.old,
              new:
                i === txns.length - 1
                  ? curr.data.zReadData.ACCUMULATED_SALES.new
                  : prev.data.zReadData.ACCUMULATED_SALES.new
            },
            version: curr.data.zReadData.version,
            isNonVat: prev.data.zReadData.isNonVat || curr.data.zReadData.isNonVat,
            supervisor: curr.data.zReadData.supervisor
          }
        }
      };
    });

    return aggregatedTransactions;
  };

  const aggTxns = aggregateTransactions(transactions);
  const {
    SI_NUM,
    VOID_NUM,
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
    SALES,
    ACCUMULATED_SALES
  } = aggTxns.data.zReadData;

  printer.newLine();
  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.UnitConfig].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '')
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);

  printer.newLine();
  printer.println('Periodical Z-Reading');
  printer.println(
    `Store code: ${settings[SettingsCategoryEnum.UnitConfig].storeCode}`
  );
  printer.println(`POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);

  printer.println(`From: ${moment(fromTransactionDate).format('MM/DD/YYYY')} `);
  printer.println(`To: ${moment(toTransactionDate).format('MM/DD/YYYY')} `);

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

  if (payments.cashOnDelivery?.LALAMOVE?.count > 0) {
    printer.println('*** LALAMOVE ***');
    printer.leftRight(
      `LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
      fCurrency(
        '',
        roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total)
      )
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
      fCurrency(
        '',
        roundUpAmount(payments.cashOnDelivery?.LBC.total)
      )
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
      fCurrency(
        '',
        roundUpAmount(payments.cashOnDelivery?.PAYO.total)
      )
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
      fCurrency(
        '',
        roundUpAmount(payments.cashOnDelivery?.WSI.total)
      )
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

  if (aggTxns.data.zReadData.version === '2.0') {
    if ((
      payments.nonCash.eWallets.GCASH.count +
      payments.nonCash.eWallets.MAYA.count +
      (payments.nonCash.eWallets.PAYPAL?.count || 0) +
      (payments.nonCash.eWallets.PAYMONGO?.count || 0)) > 0
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
          fCurrency(
            '',
            roundUpAmount(payments.nonCash.eWallets.PAYMONGO.total)
          )
        );
      }

      if (payments.nonCash.eWallets.PAYPAL?.count > 0) {
        printer.leftRight(
          `PAYPAL (${payments.nonCash.eWallets.PAYPAL.count})`,
          fCurrency(
            '',
            roundUpAmount(payments.nonCash.eWallets.PAYPAL.total)
          )
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
    )
    printer.leftRight(
      `TOTAL REFUND (${cashierAudit.NUM_REFUND_TXN})`,
      fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
    )
  }

  printer.drawLine();
  printer.leftRight(
    `TOTAL (${payments.summary.count})`,
    fCurrency('', roundUpAmount(payments.summary.total))
  );
  printer.drawLine();

  printer.leftRight(
    `CASH (${payments.cash.count + (payments.cashOnDelivery?.summary?.count || 0) + (payments.custom?.cash?.summary?.count || 0)})`,
    fCurrency('', roundUpAmount(payments.cash.total + (payments.cashOnDelivery?.summary?.total || 0) + (payments.custom?.cash?.summary?.total || 0)))
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
    `VAT (${aggTxns.data.zReadData.isNonVat ? 0 : vat.count})`,
    aggTxns.data.zReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    `TOTAL VAT (${aggTxns.data.zReadData.isNonVat ? 0 : vat.count})`,
    aggTxns.data.zReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    'VATable Sales',
    fCurrency('', aggTxns.data.zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatableSales)
  );
  printer.leftRight(
    'VAT',
    fCurrency('', aggTxns.data.zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatAmount)
  );
  printer.leftRight('VAT-Exempt Sales', fCurrency('', vat.VAT_DETAILS.vatExemptSales));
  printer.leftRight(
    'VAT-Zero Rated Sales',
    fCurrency('', aggTxns.data.zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatZeroRated)
  );
  printer.leftRight('Non-VAT', fCurrency('', vat.VAT_DETAILS.nonVatable));
  printer.drawLine();

  printer.leftRight('TOTAL NET SALES', fCurrency('', SALES.net));
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

  initialFund.INITIAL_FUND.forEach((initial) => {
    printer.leftRight(initial.employeeId, fCurrency('', roundUpAmount(initial.total)));
  });

  printer.leftRight('TOTAL', fCurrency('', roundUpAmount(initialFund.total)));
  printer.leftRight('CASH DEPOSIT AMT', fCurrency('', roundUpAmount(initialFund.total)));
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
    fCurrency('', initialFund.INITIAL_FUND[0] ? roundUpAmount(cashDrop.TOTAL_IN_DRAWER) : '0.00')
  );
  printer.println('TOTAL DECLARATION');
  printer.leftRight(
    `CASH PESO (${cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS})`,
    fCurrency('', roundUpAmount(cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION))
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

  printer.leftRight('TOTAL', fCurrency('', takeout[0] ? roundUpAmount(FINAL_TOTAL) : '0.00'));
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
  printer.leftRight('Deposit Amt', fCurrency('', roundUpAmount(cashierAudit.TOTAL_DEPOSIT_AMOUNT)));
  printer.leftRight('Ave. Basket', fCurrency('', roundUpAmount(cashierAudit.AVE_BASKET)));

  printer.println('=================================');
  printer.alignLeft();
  printer.println('OLD ACCUMULATED SALES:');
  printer.println(fCurrency('', roundUpAmount(ACCUMULATED_SALES.old)));
  printer.println('NEW ACCUMULATED SALES:');
  printer.println(fCurrency('', roundUpAmount(ACCUMULATED_SALES.new)));
  printer.println(`ZREAD COUNT: ${aggTxns.data.zReadData.zReadLogsCount + 1}`);
  printer.drawLine();
  printer.newLine();

  if (VOID_NUM.from !== null) {
    printer.alignLeft();
    printer.println('Beginning Void No.');
    printer.println(VOID_NUM.from);
    printer.println('Ending Void No.');
    printer.println(VOID_NUM.to);
  }

  printer.println('Beginning SI No.');
  printer.println(SI_NUM.from);
  printer.println('Ending SI No.');
  printer.println(SI_NUM.to);
  printer.println('GENERATED ON');
  printer.println(
    `${moment(generatedDate).format('MM/DD/YYYY - hh:mm A')}`
  );
  printer.println('Authorized By');
  printer.println(
    cashier.role === 'cashier'
      ? `${aggTxns.data.zReadData.supervisor.firstname.toUpperCase()} ${aggTxns.data.zReadData.supervisor.lastname.toUpperCase()}`
      : `${cashier.firstname.toUpperCase()} ${cashier.lastname.toUpperCase()} (${cashier.id})`
  );

  printer.newLine();
  printer.alignCenter();
  printer.println('Umbra Digital Company');
  printer.println('930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines');
  printer.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
  printer.println(`Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued}`);
  printer.println(`PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued}`);

  printer.newLine();
  printer.println('Thank you for shopping');
  printer.println(`Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`);

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

    res.setHeader('Content-Disposition', 'attachment; filename="PeriodicalZRead.txt"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    res.send('\ufeff' + printer.getText());

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