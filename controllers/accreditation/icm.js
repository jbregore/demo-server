const fs = require('fs');
const moment = require('moment');
const HttpError = require('../../middleware/http-error');
const Preview = require('../../models/Preview');
const path = require('path');
const { SettingsCategoryEnum } = require('../common/settingsData');
const Transaction = require('../../models/Transaction');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.saveDailySales = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const { storeCode, tenantId, terminalNumber, icmSalesTypeCode } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const [, month, day] = transactionDate.split('-');

    // Check if Z-Read data already exists
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

    let totalSCD = 0;
    let totalPWD = 0;
    let totalDiscountWithApproval = 0;
    let totalDiscountWithoutApproval = 0;
    let totalOtherDiscount = 0;

    // Get discounts amounts
    zReadData.data.zReadData.discounts.DISCOUNT_ITEMS.forEach((d) => {
      if (d.discount === 'SCD') {
        totalSCD = d.total;
      } else if (d.discount === 'PWD') {
        totalPWD = d.total;
      } else {
        totalOtherDiscount += d.total;
      }
    });

    const oldAccumulatedSales = zReadData.data.zReadData.ACCUMULATED_SALES.old;
    const newAccumulatedSales = zReadData.data.zReadData.ACCUMULATED_SALES.new;
    const grossSales = zReadData.data.zReadData.SALES.gross;
    const nonTaxSales = zReadData.data.zReadData.vat.VAT_DETAILS.vatExemptSales;
    const vatAmount = zReadData.data.zReadData.vat.VAT_DETAILS.vatAmount;
    const netSales = zReadData.data.zReadData.SALES.net;
    const otherCharges = 0;
    const serviceCharges = 0;
    const cashSales = zReadData.data.zReadData.payments.cash.total;
    const chargeSales =
      zReadData.data.zReadData.payments.summary.total -
      zReadData.data.zReadData.payments.cash.total -
      zReadData.data.zReadData.payments.nonCash.giftCards.summary.total;
    const gcSales = zReadData.data.zReadData.payments.nonCash.giftCards.summary.total;
    const voidAmount = zReadData.data.zReadData.cashierAudit.VOID_TXN_AMOUNT ?? 0;
    const refundAmount = zReadData.data.zReadData.cashierAudit.REFUND_TXN_AMOUNT ?? 0;
    const customerCount = zReadData.data.zReadData.cashierAudit.NUM_SALES_TXN ?? 0;
    const controlNumber = 0;
    const totalSalesTransaction = zReadData.data.zReadData.cashierAudit.NUM_SALES_TXN ?? 0;
    const salesType = icmSalesTypeCode ?? '';
    const netSalesAmount = zReadData.data.zReadData.SALES.net;

    const filePath = path.join(documentsDir, 'UMBRA_POS_REPORTS', 'ICM');
    const fileName = `D.${storeCode}-${tenantId}.${terminalNumber}.${month}${day}`;

    const content = [
      `01${tenantId}`,
      `02${terminalNumber}`,
      `03${transactionDate}`,
      `04${formatDecimalNumber(oldAccumulatedSales)}`,
      `05${formatDecimalNumber(newAccumulatedSales)}`,
      `06${formatDecimalNumber(grossSales)}`,
      `07${formatDecimalNumber(nonTaxSales)}`,
      `08${formatDecimalNumber(totalSCD)}`,
      `09${formatDecimalNumber(totalPWD)}`,
      `10${formatDecimalNumber(totalDiscountWithApproval)}`,
      `11${formatDecimalNumber(totalDiscountWithoutApproval)}`,
      `12${formatDecimalNumber(totalOtherDiscount)}`,
      `13${formatDecimalNumber(refundAmount)}`,
      `14${formatDecimalNumber(vatAmount)}`,
      `15${formatDecimalNumber(otherCharges)}`,
      `16${formatDecimalNumber(serviceCharges)}`,
      `17${formatDecimalNumber(netSales)}`,
      `18${formatDecimalNumber(cashSales)}`,
      `19${formatDecimalNumber(chargeSales)}`,
      `20${formatDecimalNumber(gcSales)}`,
      `21${formatDecimalNumber(voidAmount)}`,
      `22${customerCount}`,
      `23${controlNumber}`,
      `24${totalSalesTransaction}`,
      `25${salesType}`,
      `26${formatDecimalNumber(netSalesAmount)}`
    ];

    const fileContent = content.join('\n');

    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });

    fs.writeFileSync(path.join(filePath, fileName), fileContent);
    return res.status(200).json({ message: 'Successfulle generated file' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      err,
      req,
      'Something went wrong on saving ICM daily sales file.',
      500
    );
    return next(error);
  }
};

exports.saveHourlySales = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const { tenantId, terminalNumber, storeCode } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const [, month, day] = transactionDate.split('-');

    const hours = [];
    // Fill an array with all hours
    for (let i = 1; i <= 24; i++) hours.push(i);

    const hourlyFilter = hours.map((hour) => {
      // When hour is 12 am, change start date and end date filter to start of next day
      if (hour === 24) {
        return {
          startDate: moment(transactionDate)
            .add(1, 'day')
            .set({ hour: 0, minute: 1, second: 0 })
            .format('YYYY-MM-DD HH:mm:ss'),
          endDate: moment(transactionDate)
            .add(1, 'day')
            .set({ hour: 1, minute: 0, second: 0 })
            .format('YYYY-MM-DD HH:mm:ss')
        };
      }

      return {
        startDate: moment(transactionDate)
          .set({ hour, minute: 1, second: 0 })
          .format('YYYY-MM-DD HH:mm:ss'),
        endDate: moment(transactionDate)
          .set({ hour: hour + 1, minute: 0, second: 0 })
          .format('YYYY-MM-DD HH:mm:ss')
      };
    });

    const hourlySalesPromises = hourlyFilter.map((hour, index) => {
      // eslint-disable-next-line
      return new Promise(async (resolve, reject) => {
        try {
            const result = await Transaction.aggregate([
                {
                    $match: {
                      transactionDate: {
                        $gte: new Date(hour.startDate),
                        $lte: new Date(hour.endDate),
                      },
                      type: { $in: ['regular', 'void', 'return', 'refund'] },
                    },
                  },
                  {
                    $group: {
                      _id: '$type',
                      total: { $sum: '$amount' },
                      count: { $sum: 1 },
                    },
                  },
                  {
                    $project: {
                      _id: 0,
                      type: '$_id',
                      total: 1,
                      count: 1,
                    },
                  },
            ]);

          resolve({
            hourCode: `${index + 1 > 9 ? '' : '0'}${index + 1}`,
            startDate: hour.startDate,
            endDate: hour.endDate,
            data: result
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    const hourlySales = await Promise.all(hourlySalesPromises);
    let content = [`01${tenantId}`, `02${terminalNumber}`, `03${transactionDate}`];

    let totalNetSales = 0;
    let totalCount = 0;
    hourlySales.forEach((sale) => {
      if (!sale.data) {
        content = [...content, `04${sale.hourCode}`, `050`, `060`, `070`];
        return;
      }

      // Reduce the data array to one object
      const reducedResult = sale.data.reduce((prev, curr) => {
        return {
          [`${curr.type}`]: {
            total: curr.total,
            count: curr.count
          },
          ...prev
        };
      }, {});

      // Get the total sales for the hour
      const totalSales =
        (reducedResult?.regular?.total ?? 0) -
        (Math.abs(reducedResult?.void?.total ?? 0) +
          Math.abs(reducedResult?.refund?.total ?? 0) +
          Math.abs(reducedResult?.return?.total ?? 0));

      totalNetSales += totalSales;
      totalCount += reducedResult?.regular?.count ?? 0;

      // Add to content
      content = [
        ...content,
        `04${sale.hourCode}`,
        `05${formatDecimalNumber(totalSales)}`,
        `06${reducedResult?.regular?.count ?? 0}`,
        `07${reducedResult?.regular?.count ?? 0}`
      ];
    });

    // Continue content from 8 to 10
    content = [
      ...content,
      `08${formatDecimalNumber(totalNetSales)}`,
      `09${totalCount}`,
      `10${totalCount}`
    ];
    const fileContent = content.join('\n');

    const filePath = path.join(documentsDir, 'UMBRA_POS_REPORTS', 'ICM');
    const fileName = `H.${storeCode}-${tenantId}.${terminalNumber}.${month}${day}`;

    !fs.existsSync(filePath) && fs.mkdirSync(filePath, { recursive: true });
    fs.writeFileSync(path.join(filePath, fileName), fileContent);

    return res.status(200).json({ message: 'Successfully generated file.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(
      err,
      req,
      'Something went wrong on saving ICM daily sales file.',
      500
    );
    return next(error);
  }
};

const formatDecimalNumber = (num) => {
  const decimaled = num.toFixed(2);
  const numString = decimaled.toString(decimaled);
  const formattedDecimal = numString.split('.').join('');
  return formattedDecimal;
};
