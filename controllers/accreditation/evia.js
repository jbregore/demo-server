const moment = require('moment');
const fs = require('fs');
const HttpError = require('../../middleware/http-error');
const Preview = require('../../models/Preview');
const path = require('path');
const { SettingsCategoryEnum } = require('../common/settingsData');
const Order = require('../../models/Order');
const Transaction = require('../../models/Transaction');
const TransactionAmount = require('../../models/TransactionAmount');
const DiscountLog = require('../../models/DiscountLog');
const PaymentLog = require('../../models/PaymentLog');

exports.createDailySalesFile = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const { storeCode, eviaStallCode, eviaSalesCode, eviaLocalSavePath } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};

    // Check for zRead Data
    const zReadData = await Preview.findOne({
      storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      }
    });

    if (!zReadData) {
      return res
        .status(500)
        .json({ message: 'The current date you selected does not contain EOD data yet.' });
    }

    if (!eviaLocalSavePath) {
      return res
        .status(500)
        .json({ message: 'There is no local save path provided in the settings.' });
    }

    // Create the directory for saving file
    !fs.existsSync(eviaLocalSavePath) && fs.mkdirSync(eviaLocalSavePath);

    // Get file data for yesterday
    const fileNamePrevDate = moment(transactionDate).subtract(1, 'day').format('MMDDYY');
    let oldGrandTotal = 0;
    let prevCounter = 1;
    let prevFileFound = false;
    let prevFileName = `${fileNamePrevDate}${prevCounter.toString().padStart(2, '0')}.sal`;
    while (!prevFileFound) {
      prevFileName = `${fileNamePrevDate}${prevCounter.toString().padStart(2, '0')}.sal`;
      const fileExists = fs.existsSync(path.join(eviaLocalSavePath, prevFileName));
      if (fileExists) {
        prevCounter += 1;
      } else {
        prevCounter -= 1;
        if (prevCounter === 0) {
          prevFileFound = false;
        } else {
          prevFileName = `${fileNamePrevDate}${prevCounter.toString().padStart(2, '0')}.sal`;
          prevFileFound = true;
        }
        break;
      }
    }

    if (prevFileFound) {
      const prevData = fs.readFileSync(path.join(eviaLocalSavePath, prevFileName), 'utf-8');
      const splitData = prevData.split('\n');
      const lastLine = splitData[splitData.length - 1];
      console.log(`Last line is `, lastLine);
      // Get the new grand total in the fifth column
      oldGrandTotal = Number(lastLine.split(' ')[4].replace(',', ''));
    }

    // Fill an array with all hours
    const hours = [];
    for (let i = 1; i <= 24; i++) hours.push(i);

    const hoursFilter = hours.map((hour) => {
      return {
        startDate: moment(transactionDate)
          .set({ hour: 0, minute: 0, second: 0 })
          .format('YYYY-MM-DD HH:mm:ss'),
        endDate: moment(transactionDate)
          .set({ hour: hour, minute: 0, second: 0 })
          .format('YYYY-MM-DD HH:mm:ss')
      };
    });

    const hourlyQueries = hoursFilter.map((hourFilter, index) => {
      // eslint-disable-next-line
      return new Promise(async (resolve, reject) => {
        try {

          const startDate = `${hourFilter.startDate.split(" ")[0]}T${hourFilter.startDate.split(" ")[1]}Z`
          const endDate = `${hourFilter.endDate.split(" ")[0]}T${hourFilter.endDate.split(" ")[1]}Z`

          const nonSalesTxnNumbers = await Order.distinct('txnNumber', {
            status: { $in: ['void', 'refund', 'return'] },
            orderDate: { $gte: new Date(startDate), $lte: new Date(endDate) }
          });

          const [refunds] = await Transaction.aggregate([
            {
              $match: {
                transactionDate: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
                },
                type: 'refund'
              }
            },
            {
              $group: {
                _id: '$type',
                total: { $sum: '$amount' },
                count: { $count: {} }
              }
            }
          ]);

          const [totalVatDetails] = await TransactionAmount.aggregate([
            {
              $match: {
                transactionDate: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
                },
                txnNumber: { $nin: nonSalesTxnNumbers }
              }
            },
            {
              $group: {
                _id: null,
                totalVatSales: { $sum: '$vatableSale' },
                totalVat: { $sum: '$vatAmount' },
                totalVatExempt: { $sum: '$vatExempt' },
                totalVatZeroRated: { $sum: '$vatZeroRated' },
                totalAmount: { $sum: '$totalAmount' },
                totalCount: { $sum: 1 }
              }
            },
            {
              $project: {
                _id: 0,
                totalVatSales: 1,
                totalVat: 1,
                totalVatExempt: 1,
                totalVatZeroRated: 1,
                totalAmount: 1,
                totalCount: 1
              }
            }
          ]);

          const [cancelled] = await Order.aggregate([
            {
              $match: {
                updatedAt: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
                },
                status: 'cancelled'
              }
            },
            {
              $group: {
                _id: '$status',
                total: { $sum: '$price' },
                totalCount: { $sum: 1 },
                distinctOrderIds: { $addToSet: '$orderId' }
              }
            },
            {
              $project: {
                status: '$_id',
                total: 1,
                totalCount: 1,
                count: { $size: '$distinctOrderIds' }
              }
            }
          ]);

          const [discounts] = await DiscountLog.aggregate([
            {
              $match: {
                discountDate: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
                },
                discount: { $nin: ['VAT', 'DPLMTS', 'VATZR'] },
                txnNumber: { $nin: nonSalesTxnNumbers }
              }
            },
            {
              $group: {
                _id: null,
                totalDiscount: { $sum: '$amount' }
              }
            },
            {
              $project: {
                _id: 0,
                totalDiscount: 1
              }
            }
          ]);

          const [discountsWithoutSCDPWD] = await DiscountLog.aggregate([
            {
              $match: {
                discountDate: {
                  $gte: new Date(startDate),
                  $lte: new Date(endDate)
                },
                discount: { $nin: ['VAT', 'DPLMTS', 'VATZR', 'SCD', 'PWD'] },
                txnNumber: { $nin: nonSalesTxnNumbers }
              }
            },
            {
              $group: {
                _id: null,
                totalDiscount: { $sum: '$amount' }
              }
            },
            {
              $project: {
                _id: 0,
                totalDiscount: 1
              }
            }
          ]);

          const refundSiNumbers = await Transaction.aggregate([
            {
              $match: {
                type: 'refund',
                transactionDate: {
                  $lte: new Date(endDate)
                }
              }
            },
            {
              $project: {
                orig_si_number: '$siNumber'
              }
            }
          ]);

          const siNumbers = refundSiNumbers.map((txn) => txn.orig_si_number);

          const matchingTransactions = await Transaction.find(
            {
              type: 'refund',
              siNumber: { $in: siNumbers }
            },
            '_id txnNumber'
          );
         
          const txnNumbers = matchingTransactions.map((txn) => txn.txnNumber);

          const [prevDayRefunds] = await PaymentLog.aggregate([
            {
              $match: {
                txnNumber: { $in: txnNumbers },
                paymentDate: {
                  $lt: new Date(endDate)
                }
              }
            },
            {
              $group: {
                _id: null,
                total: { $sum: '$amount' }
              }
            }
          ]);

          resolve({
            endingHour: index + 1,
            ...hourFilter,
            refunds,
            totalVatDetails,
            cancelled,
            discounts,
            discountsWithoutSCDPWD,
            prevDayRefunds
          });
        } catch (err) {
          console.log(err);
          reject(err);
        }
      });
    });

    const hourlyTransactions = await Promise.all(hourlyQueries);

    let lines = [];

    let totalGross = 0;
    let totalVatAmount = 0;
    let totalDiscounts = 0;
    let totalSalesCount = 0;
    let totalRefundsCount = 0;
    let totalRefundsAmount = 0;
    let totalCancelledCount = 0;
    let totalCancelledAmount = 0;
    let totalVatExempt = 0;

    // Data for 01 record / hourly sales in file
    hourlyTransactions.forEach((txn) => {
      // console.log("txn.totalVatDetails ", txn.totalVatDetails)
      // Calculate for the total gross sale for the hour
      const grossSales =
        (txn.totalVatDetails?.totalVat ?? 0) +
        (txn.totalVatDetails?.totalVatSales ?? 0) +
        (txn.discountsWithoutSCDPWD?.totalDiscount ?? 0) -
        (txn.prevDayRefunds?.total ?? 0);

      const line = [
        '01', // Record ID
        `"${eviaStallCode ?? ''}"`, // Stall Code
        txn.endingHour === 24
          ? moment(transactionDate).add(1, 'day').format('MM/DD/YYYY')
          : moment(transactionDate).format('MM/DD/YYYY'), // Transaction Date
        moment().hour(txn.endingHour).minute(0).format('HH:mm'), // Transaction Hour
        formatNumber(grossSales), // Gross Sales
        formatNumber(txn.totalVatDetails?.totalVat ?? 0), // Total VAT
        formatNumber(txn.discounts?.totalDiscount ?? 0), // Total Discounts
        0, // Service Charge
        txn.totalVatDetails?.totalCount ?? 0, // No. of Sales Transactions
        `"${eviaSalesCode ?? ''}"`, // Sales Code
        txn.refunds?.count ?? 0, // Number of refunds
        formatNumber(Math.abs(txn.refunds?.total ?? 0)), // Total refunded amount
        txn.cancelled?.count ?? 0, // Number of cancels
        formatNumber(txn.cancelled?.total ?? 0), // Number of cancels
        formatNumber(txn.totalVatDetails?.totalVatExempt ?? 0), // Number of total VAT Exempt sales
        1 // Number of POS
      ];

      totalGross = grossSales;
      totalSalesCount = txn.totalVatDetails?.totalCount ?? 0;
      totalVatAmount = txn.totalVatDetails?.totalVat ?? 0;
      totalDiscounts = txn.discounts?.totalDiscount ?? 0;
      totalRefundsCount = txn.refunds?.count ?? 0;
      totalRefundsAmount = Math.abs(txn.refunds?.total ?? 0);
      totalCancelledCount = txn.cancelled?.count ?? 0;
      totalVatExempt = txn.totalVatDetails?.totalVatExempt ?? 0;

      lines.push(line.join(' '));
      console.log(`Line is `, line.join(' '));
    });

    // Data for 99 record / Daily sales line
    const dailyLine = [
      '99', // Record ID
      `"${eviaStallCode ?? ''}"`, // Stall code
      moment(transactionDate).format('MM/DD/YYYY'), // Transaction Date
      formatNumber(totalGross), // Gross Sales
      formatNumber(totalVatAmount), // Total VAT
      formatNumber(totalDiscounts), // Total Discounts
      0, // Service Charge
      totalSalesCount, // No. of Sales Transactions
      `"${eviaSalesCode ?? ''}"`, // Sales Code
      totalRefundsCount, // Number of refunds
      formatNumber(totalRefundsAmount), // Total refunded amount
      totalCancelledCount, // Number of cancels
      formatNumber(totalCancelledAmount), // Number of cancels
      formatNumber(totalVatExempt), // Number of total VAT Exempt sales
      1 // Number of POS
    ];

    lines.push(dailyLine.join(' '));
    console.log(`Daily line is `, dailyLine.join(' '));

    // Data for record 99
    const eodLine = [
      '95',
      `"${eviaStallCode ?? ''}"`,
      moment(transactionDate).format('MM/DD/YYYY'),
      formatNumber(oldGrandTotal), // Old Grand Total
      formatNumber(oldGrandTotal + totalGross + totalVatExempt), //New Grand Total
      1
    ];
    console.log(`EOD line is `, eodLine.join(' '));
    lines.push(eodLine.join(' '));

    const fileNameDate = moment(transactionDate).format('MMDDYY');
    let counter = 1;
    let fileFound = false;
    let fileName = `${fileNameDate}${counter.toString().padStart(2, '0')}.sal`;

    while (!fileFound) {
      fileName = `${fileNameDate}${counter.toString().padStart(2, '0')}.sal`;
      const fileExists = fs.existsSync(path.join(eviaLocalSavePath, fileName));
      if (fileExists) {
        counter += 1;
        continue;
      } else {
        break;
      }
    }

    fs.writeFileSync(path.join(eviaLocalSavePath, fileName), lines.join('\n'));

    return res.status(200).json({ message: 'tes' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Something went wrong on generating EVIA report file.');
    return next(error);
  }
};

function formatNumber(num) {
  return Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'decimal'
  }).format(num);
}
