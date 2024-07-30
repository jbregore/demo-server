// const internetAvailable = require('internet-available');
const { exec } = require('child_process');
const write = require('write');
const fs = require('fs');
const moment = require('moment');

const HttpError = require('../../middleware/http-error');
const Preview = require('../../models/Preview');
const TransactionAmount = require('../../models/TransactionAmount');
const path = require('path');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.getDailySalesData = async (req, res, next) => {
  const { transactionDate, storeCode } = req.params;
  const { tenantId, terminalNumber, salesTypeCode } = req.query;

  // check if date has EOD data
  let validDate = false;
  try {
    validDate = await Preview.find({
      storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);
  } catch (err) {
    const error = new HttpError(
      'Something went wrong while validating the selected date, please try again.',
      500
    );
    return next(error);
  }

  if (validDate.length === 0) {
    const error = new HttpError(
      'The current date you selected does not contain EOD data yet.',
      422
    );
    return next(error);
  }

  // grab payments per hour
  const HOURLY_SALES = await TransactionAmount.aggregate([
    {
      $match: {
        storeCode: storeCode,
        transactionDate: {
          $gte: new Date(`${transactionDate}T00:00:00Z`),
          $lte: new Date(`${transactionDate}T23:59:59Z`)
        }
      }
    },
    {
      $project: {
        total_amount: '$totalAmount',
        transaction_date: '$transactionDate'
      }
    }
  ]);

  // grab the number of EOD
  let batchNumOfEod;
  try {
    const result = await Preview.find({
      storeCode,
      type: 'z-read'
    })
      .sort({ transactionDate: 1 })
      .maxTimeMS(300000);

      result.forEach((reading, i) => {
      if (
        moment.utc(new Date(reading.transactionDate)).format('YYYY-MM-DD') ===
        moment.utc(new Date(transactionDate)).format('YYYY-MM-DD')
      ) {
        batchNumOfEod = i + 1;
      }
    });
  } catch (err) {
    console.log("err ", err)
    const error = new HttpError(
      'Something went wrong while grabbing the batch number of EOD, please try again.',
      500
    );
    return next(error);
  }

  const terminalNumberFormat = terminalNumber > 9 ? terminalNumber : 0 + terminalNumber;
  const fileNameFormat = (x) =>
    `${x}${tenantId.slice(0, 4)}${terminalNumberFormat}${batchNumOfEod}.${getMonthFormat(
      transactionDate
    )}${moment.utc(new Date(transactionDate)).format('DD')}`;

  const { zReadData } = validDate[0].data;

  const oldAccuTotal = zReadData.ACCUMULATED_SALES.old;
  const newAccuTotal = zReadData.ACCUMULATED_SALES.new;
  const totalVoid = zReadData.cashierAudit.VOID_TXN_AMOUNT;
  const controlNumber = '0';
  const totalScdAndPwd =
    zReadData.discounts.DISCOUNT_ITEMS.find(
      (x) =>
        x.discount === 'SCD' ||
        x.discount === 'SCD-5%' ||
        x.discount === 'PWD' ||
        x.discount === 'PNSTMD'
    )?.total || 0;
  const totalOtherDisc =
    zReadData.discounts.DISCOUNT_ITEMS.find(
      (x) =>
        x.discount !== 'SCD' &&
        x.discount !== 'SCD-5%' &&
        x.discount !== 'PWD' &&
        x.discount !== 'PNSTMD' &&
        x.discount !== 'VAT' &&
        x.discount !== 'VATZR' &&
        x.discount !== 'VATEX'
    )?.total || 0;
  const totalCash = zReadData.payments.cash.total;
  let totalDebAndCred = 0;
  for (const cardType in zReadData.payments.nonCash.cards) {
    // eslint-disable-next-line
    if (zReadData.payments.nonCash.cards.hasOwnProperty(cardType)) {
      totalDebAndCred += zReadData.payments.nonCash.cards[cardType].total;
    }
  }
  let totalEWallet = 0;
  for (const eType in zReadData.payments.nonCash.eWallets) {
    // eslint-disable-next-line
    if (zReadData.payments.nonCash.eWallets.hasOwnProperty(eType)) {
      totalEWallet += zReadData.payments.nonCash.eWallets[eType].total;
    }
  }
  const totalRmesIssuance = zReadData.payments.nonCash.returns.RMES_ISSUANCE.amount || 0;
  const totalRmesRedemption = zReadData.payments.nonCash.returns.RMES_REDEMPTION.total || 0;
  const totalGC = zReadData.payments.nonCash.giftCards.summary.total;
  const totalOther = totalEWallet + totalGC + totalRmesIssuance + totalRmesRedemption;
  const totalNetSales = totalCash + totalDebAndCred + totalOther;
  const totalGrossSales = totalNetSales + totalScdAndPwd + totalOtherDisc + totalRmesIssuance;
  const totalTaxVat = zReadData.vat.VAT_DETAILS.vatAmount;
  const totalNonTaxable = zReadData.vat.VAT_DETAILS.vatExemptSales;
  const totalNumOfSalesTnx = zReadData.cashierAudit.NUM_SALES_TXN;

  const hourlySales = HOURLY_SALES.reduce((result, sale) => {
    // Extract the first hour from the payment_date
    const hour = moment(sale.transaction_date).format('HH');

    // Check if the hour already exists in the result array
    const existingHour = result.find((item) => item.hour === hour);

    if (existingHour) {
      // Hour already exists, add the sale to the existing hour
      existingHour.sales.push(sale);
    } else {
      // Hour doesn't exist, create a new hour object and add the sale
      result.push({ hour, sales: [sale] });
    }

    return result;
  }, []);

  hourlySales.sort((a, b) => a.hour - b.hour);

  const dailySalesObj = {
    tenantCode: '01' + tenantId,
    terminalNumber: '02' + terminalNumber,
    date: '03' + moment.utc(new Date(transactionDate)).format('MMDDYYYY'),
    oldAccuTotal: '04' + roundUpAmount(oldAccuTotal).replace('.', ''),
    newAccuTotal: '05' + roundUpAmount(newAccuTotal).replace('.', ''),
    totalGrossSales: '06' + roundUpAmount(totalGrossSales).replace('.', ''),
    totalNonTaxableSales: '07' + roundUpAmount(totalNonTaxable).replace('.', ''),
    totalScdAndPwd: '08' + roundUpAmount(totalScdAndPwd).replace('.', ''),
    totalOtherDisc: '09' + roundUpAmount(totalOtherDisc).replace('.', ''),
    totalRefund: '10' + roundUpAmount(totalRmesIssuance).replace('.', ''),
    totalTaxVat: '11' + roundUpAmount(totalTaxVat).replace('.', ''),
    totalServiceCharge: '12000',
    totalNet: '13' + roundUpAmount(totalNetSales).replace('.', ''),
    totalCash: '14' + roundUpAmount(totalCash).replace('.', ''),
    totalDebAndCred: '15' + roundUpAmount(totalDebAndCred).replace('.', ''),
    totalOther: '16' + roundUpAmount(totalOther).replace('.', ''),
    totalVoid: '17' + roundUpAmount(totalVoid).replace('.', ''),
    totalCustomer: '18' + totalNumOfSalesTnx,
    controlNumber: '19' + controlNumber,
    totalNumOfSalesTnx: '20' + totalNumOfSalesTnx,
    salesType: '21' + salesTypeCode,
    netSalesPerSale: '22' + roundUpAmount(totalNetSales).replace('.', '')
  };

  const hourlySalesObj = {
    tenantCode: '01' + tenantId,
    terminalNumber: '02' + terminalNumber,
    date: '03' + moment.utc(new Date(transactionDate)).format('MMDDYYYY'),
    hourlySales: hourlySales.map((x) => {
      const total = x.sales.reduce((a, b) => Number(a) + (Number(b['total_amount']) || 0), 0);

      return {
        hourCode: '04' + x.hour,
        netSales: '05' + roundUpAmount(total).replace('.', ''),
        totalNumOfSalesTnx: '06' + x.sales.length,
        totalCustomer: '07' + x.sales.length
      };
    }),
    totalNetSales: '08' + roundUpAmount(totalNetSales).replace('.', ''),
    totalNumOfSalesTnx: '09' + totalNumOfSalesTnx,
    totalCustomer: '10' + totalNumOfSalesTnx
  };

  const discountBreakdown = [];

  zReadData.discounts.DISCOUNT_ITEMS.filter(
    (x) => x.discount !== 'VAT' && x.discount !== 'VATZR' && x.discount !== 'VATEX'
  ).forEach((discount) => {
    discountBreakdown.push({
      code: discount.discount,
      description: discount.receiptLabel.replace('(', '').replace(')', ''),
      amount: Number(discount.total)
    });
  });

  const dailySalesData = Object.values(dailySalesObj).join('\n');
  let hourlySalesData = '';
  for (const key in hourlySalesObj) {
    if (typeof hourlySalesObj[key] !== 'object') {
      hourlySalesData += hourlySalesObj[key] + '\n';
    } else if (Array.isArray(hourlySalesObj[key])) {
      for (const item of hourlySalesObj[key]) {
        for (const itemKey in item) {
          hourlySalesData += item[itemKey] + '\n';
        }
      }
    }
  }
  const discountBreakdownData = discountBreakdown
    .map((disc) => Object.values(disc).join(','))
    .join('\n');

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/MWC`;
  !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

  write.sync(`${urlPath}/${fileNameFormat('S')}.txt`, '\ufeff' + dailySalesData, {
    overwrite: true
  });

  write.sync(`${urlPath}/${fileNameFormat('H')}.txt`, '\ufeff' + hourlySalesData, {
    overwrite: true
  });

  write.sync(`${urlPath}/${fileNameFormat('D')}.txt`, '\ufeff' + discountBreakdownData, {
    overwrite: true
  });

  const pathToOpen = `${documentsDir}/UMBRA_POS_REPORTS/MWC/`;
  const pathFormat = pathToOpen.replace(/\//g, '\\');

  const pathCmd = `start "" "${pathFormat}"`;

  exec(pathCmd, (err) => {
    if (err) {
      const error = new HttpError('Failed to open the file.', 500);
      return next(error);
    } else {
      res.status(200).json({ message: 'Success' });
    }
  });
};

const roundUpAmount = (num) => {
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};

const getMonthFormat = (date) => {
  const month = moment(date).format('MM');

  let format;

  switch (month) {
    case '01':
      format = '1';
      break;
    case '02':
      format = '2';
      break;
    case '03':
      format = '3';
      break;
    case '04':
      format = '4';
      break;
    case '05':
      format = '5';
      break;
    case '06':
      format = '6';
      break;
    case '07':
      format = '7';
      break;
    case '08':
      format = '8';
      break;
    case '09':
      format = '9';
      break;
    case '10':
      format = 'A';
      break;
    case '11':
      format = 'B';
      break;
    case '12':
      format = 'C';
      break;

    default:
      format = '';
  }

  return format;
};

// const sendMwcReport = async (file) => {
//   const test = {
//     optical: {
//       folder: 'OPTICAL',
//       spCode: 'SP'
//     },
//     sun: {
//       folder: 'STUDIOS',
//       spCode: 'SS'
//     },
//     face: {
//       folder: 'FACE',
//       spCode: 'SF'
//     }
//   };

//   const c = new Client();
//   const urlPath = `${app.getPath('documents')}/UMBRA_POS_REPORTS/SL_CL/${
//     test[session.settings.activeCategory.toLowerCase()].folder
//   }`;

//   try {
//     c.connect({
//       host: '119.13.100.181',
//       port: 21,
//       user: 'sunnies',
//       password: 'H*ikj528'
//     });

//     c.on('error', console.dir);
//     c.on('ready', function () {
//       c.put(
//         `${urlPath}/${file}`,
//         `UMBRA_SLCL/${test[session.settings.activeCategory.toLowerCase()].folder}/${file}`,
//         function (err) {
//           if (err) {
//             c.end();
//           }
//         }
//       );
//     });
//   } catch (err) {}
// };
