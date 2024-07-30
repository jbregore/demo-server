const Excel = require('exceljs');
const fs = require('fs');
const path = require('path');
const HttpError = require('../../middleware/http-error');
const timestamp = require('time-stamp');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const CashLog = require('../../models/CashLog');
const mongoose = require('mongoose');
const Transaction = require('../../models/Transaction');
const ActivityLog = require('../../models/ActivityLog');
const { generateNextActivityNumber } = require('../common/transaction');
const uniqid = require('uniqid');
const Preview = require('../../models/Preview');
const {
  getTxnNumber,
  getSiNumber,
  formatDate,
  getTotalCount
} = require('../../services/cash-logs/common');
const {
  checkCashTakeout,
  printCashTakeout
} = require('../../services/cash-logs/cashTakeoutService');
const { SettingsCategoryEnum } = require('../common/settingsData');
// enums

const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.checkPreviewsRange = async (req, res, next) => {
  const { from, to } = req.query;

  // Parameter Validation
  if (!from || !to) {
    const error = new HttpError(
      'Missing parameters',
      req,
      'Date range query parameter in the format YYYY-MM-DD is required: from, to',
      400
    );
    return next(error);
  }

  const fromValid = moment(from, 'YYYY-MM-DD', true).isValid();
  const toValid = moment(to, 'YYYY-MM-DD', true).isValid();
  if (!fromValid || !toValid) {
    const error = new HttpError('Invalid date format', req, 'Invalid date format.', 422);
    return next(error);
  }

  // Data Fetching
  try {
    const count = await Preview.countDocuments({
      type: 'z-read',
      transactionDate: {
        $gte: `${from}T00:00:00Z`,
        $lte: `${to}T23:59:59Z`
      }
    });

    return res.status(200).json({ count });
  } catch (err) {
    const error = new HttpError(err, req, 'Failed to get cash takeout reports.', 500);
    return next(error);
  }
};

exports.downloadEodCashReport = async (req, res, next) => {
  const { from, to, format } = req.query;
  // Parameter Validation
  if ((from && !to) || (!from && to)) {
    const error = new HttpError(
      'Missing parameters',
      req,
      'Missing parameter (YYYY-MM-DD): ' + (from ? 'to' : 'from'),
      400
    );
    return next(error);
  }

  const dateFilter = {};
  if (from && to) {
    const fromValid = moment(from, 'YYYY-MM-DD', true).isValid();
    const toValid = moment(to, 'YYYY-MM-DD', true).isValid();
    if (!fromValid || !toValid) {
      const error = new HttpError('Invalid date format', req, 'Invalid date format.', 422);
      return next(error);
    }

    dateFilter.transactionDate = {
      $gte: `${from}T00:00:00Z`,
      $lte: `${to}T23:59:59.999Z`
    };
  }

  try {
    // Data Parsing
    const zReads = await Preview.find({
      type: 'z-read',
      ...dateFilter
    }).sort({ transactionDate: 1 });

    const eodCashReport = [];
    for (const zRead of zReads) {
      const row = {
        date: await moment(zRead.transactionDate).format('MM/DD/YYYY'),
        storeCode: zRead.storeCode,
        cashSales: zRead.data.zReadData.payments.cash.total,
        actualCash: zRead.data.zReadData.takeout.reduce(
          (acc, takeout) => acc + Number(takeout.total),
          0
        ),
        excessCash: Number(
          zRead.data.zReadData.payments.nonCash.giftCards.summary.EXCESS_CASH_AMOUNT
        )
      };
      row.shortOver = row.cashSales - row.actualCash - row.excessCash;

      eodCashReport.push(row);
    }

    // JSON Download
    if (format === 'json') {
      return res.status(200).json(eodCashReport);
    }

    // Workbook Setup
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('EOD Cash Report');

    worksheet.columns = [
      { key: 'date', header: 'Date' },
      {
        key: 'storeCode',
        header: 'Store Code',
        style: { alignment: { vertical: 'middle', horizontal: 'center' } }
      },
      { key: 'cashSales', header: 'Cash Sales', style: { numFmt: '#,##0.00' } },
      { key: 'actualCash', header: 'Actual Cash', style: { numFmt: '#,##0.00' } },
      { key: 'excessCash', header: 'Excess Cash', style: { numFmt: '#,##0.00' } },
      { key: 'shortOver', header: 'Short/(Over)', style: { numFmt: '#,##0.00_);(#,##0.00)' } }
    ];

    worksheet.columns.forEach((sheetColumn) => {
      sheetColumn.font = {
        size: 11
      };
      sheetColumn.width = 15;
    });

    const headerRow = worksheet.getRow(1);
    headerRow.font = {
      bold: true,
      size: 11
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    for (const row of eodCashReport) {
      worksheet.addRow(row);
    }

    // File Export
    const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/EOD_CASH_REPORTS/`;
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

    const exportPath = path.resolve(urlPath, `EOD Cash Report - ${from} - ${to}.csv`);
    await workbook.csv.writeFile(exportPath);

    await res.download(exportPath, `EOD Cash Report - ${from} - ${to}.csv`);
  } catch (err) {
    const error = new HttpError(err, req, 'Failed to get cash takeout reports.', 500);
    return next(error);
  }
};

exports.createCashTakeout = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        posTransaction,
        activityLog,
        cashTakeout,
        printData,
        previewData,
        fromOutofSync = false
      } = req.body;

      //pos-transaction
      const [txnNumber, siNumber] = await Promise.all([
        getTxnNumber(),
        getSiNumber(posTransaction.storeCode, posTransaction.type)
      ]);

      const { date: transactionDate, time: transactionTime } = formatDate(
        posTransaction.transactionDate
      );
      await Transaction.create(
        [
          {
            amount: posTransaction.amount,
            employeeId: posTransaction.employeeId,
            storeCode: posTransaction.storeCode,
            type: posTransaction.type,
            txnNumber,
            siNumber,
            transactionDate: new Date(`${transactionDate}T${transactionTime}Z`)
          }
        ],
        { session }
      );

      //activity-log
      const { date: activityDate, time: activityTime } = formatDate(activityLog.activityDate);
      await ActivityLog.create(
        [
          {
            activityLogId: uniqid(activityLog.storeCode),
            transactionId: await generateNextActivityNumber(),
            firstName: activityLog.firstname,
            lastName: activityLog.lastname,
            employeeId: activityLog.employeeId,
            activity: activityLog.activity,
            description: `${activityLog.description.user.firstname} ${activityLog.description.user.lastname} has report a cash takeout with an Transaction Number: ${txnNumber} and total amount of ${activityLog.description.total}.`,
            action: activityLog.action,
            storeCode: activityLog.storeCode,
            activityDate: new Date(`${activityDate}T${activityTime}Z`)
          }
        ],
        { session }
      );

      //cash takeout
      const [cashTakeoutDate, cashTakeoutTime] = moment(cashTakeout.cashDate)
        .format('YYYY-MM-DD HH:mm:ss')
        .split(' ');
      const [, startTime] = moment(cashTakeoutDate)
        .startOf('day')
        .format('YYYY-MM-DD HH:mm:ss')
        .split(' ');
      const [, endTime] = moment(cashTakeoutDate)
        .endOf('day')
        .format('YYYY-MM-DD HH:mm:ss')
        .split(' ');

      const isCashTakeoutExist = await checkCashTakeout(cashTakeout.shift, cashTakeoutDate, {
        startTime,
        endTime
      });

      if (isCashTakeoutExist) {
        const error = new Error('Cashier has already taken out cash.');
        error.statusCode = 400;
        throw error;
      }

      const logId = `${cashTakeout.branchCode}-${timestamp('YYYYMMDDHHmmss')}`;
      const totalCount = getTotalCount(cashTakeout);

      const total = Object.values(totalCount).reduce((a, b) => a + b, 0);
      const totalWithDecimal = parseFloat(total.toFixed(2));

      await CashLog.create(
        [
          {
            reportCashLogId: logId,
            peso1000: cashTakeout.peso1000,
            peso500: cashTakeout.peso500,
            peso200: cashTakeout.peso200,
            peso100: cashTakeout.peso100,
            peso50: cashTakeout.peso50,
            peso20: cashTakeout.peso20,
            peso10: cashTakeout.peso10,
            peso5: cashTakeout.peso5,
            cent25: cashTakeout.cent25,
            cent10: cashTakeout.cent10,
            cent05: cashTakeout.cent05,
            cent01: cashTakeout.cent01,
            total: totalWithDecimal,
            employeeId: cashTakeout.employeeId,
            cashierFirstName: cashTakeout.cashierFirstName,
            cashierLastName: cashTakeout.cashierLastName,
            shift: cashTakeout.shift,
            txnNumber: txnNumber,
            type: 'cash takeout',
            branchCode: cashTakeout.branchCode,
            cashDate: new Date(`${cashTakeoutDate}T${cashTakeoutTime}Z`)
          }
        ],
        { session }
      );

      if (!fromOutofSync) {
        //print
        await printCashTakeout(printData);
      }

      //create preview
      const { date: previewDate, time: previewTime } = formatDate(previewData.transactionDate);
      await Preview.create(
        [
          {
            txnNumber: txnNumber,
            type: previewData.type,
            storeCode: previewData.storeCode,
            transactionDate: new Date(`${previewDate}T${previewTime}Z`),
            data: {
              cashReport: {
                ...previewData.data.cashReport,
                txnNumber: txnNumber
              },
              total: previewData.data.total
            }
          }
        ],
        { session }
      );
    });

    return res.status(200).json({ message: 'Successfully added cash takeout.' });
  } catch (err) {
    console.log(err);
    if (err.statusCode == 400) {
      return res.status(400).json({
        message: err.message
      });
    }
    const error = new HttpError('Something went wrong on creating cash takeout.');
    return next(error);
  } finally {
    session.endSession();
  }
};

exports.printCashTakeout = async (req, res, next) => {
  let { apiData, settings } = req.body;
  const { cashReport, total, isReprint } = apiData;
  const { UnitConfig, CompanyInfo } = SettingsCategoryEnum;

  if (!req.body) {
    const error = new HttpError('No content to print.', 422);
    return next(error);
  }

  let printer = new ThermalPrinter({
    type: Types.EPSON,
    interface: `//localhost/${settings[UnitConfig].printerName}`,
    width: '33px',
    characterSet: 'SLOVENIA',
    removeSpecialCharacters: true,
    lineCharacter: '-'
  });

  const cash = {
    peso1000: {
      label: '1000.00',
      value: cashReport.peso1000
    },
    peso500: {
      label: '500.00',
      value: cashReport.peso500
    },
    peso200: {
      label: '200.00',
      value: cashReport.peso200
    },
    peso100: {
      label: '100.00',
      value: cashReport.peso100
    },
    peso50: {
      label: '50.00',
      value: cashReport.peso50
    },
    peso20: {
      label: '20.00',
      value: cashReport.peso20
    },
    peso10: {
      label: '10.00',
      value: cashReport.peso10
    },
    peso5: {
      label: '5.00',
      value: cashReport.peso5
    },
    peso1: {
      label: '1.00',
      value: cashReport.peso1
    },
    cent25: {
      label: '0.25',
      value: cashReport.cent25
    },
    cent10: {
      label: '0.10',
      value: cashReport.cent10
    },
    cent05: {
      label: '0.05',
      value: cashReport.cent05
    },
    cent01: {
      label: '0.01',
      value: cashReport.cent01
    }
  };

  printer.newLine();
  printer.alignCenter();
  printer.println(settings[CompanyInfo].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[CompanyInfo].companyName);
  printer.println(settings[CompanyInfo].companyAddress1);
  printer.println(settings[CompanyInfo].companyAddress2);
  printer.println(settings[CompanyInfo].companyContactNumber ?? '');
  printer.println(
    cashReport.isNonVat
      ? `NON VATReg TIN ${settings[UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[UnitConfig].permit}`);
  printer.println(settings[UnitConfig].snMin);
  printer.println(`POS # ${settings[UnitConfig].terminalNumber} PHP`);

  printer.newLine();
  printer.println('C A S H  T A K E O U T');
  isReprint && printer.println('(REPRINT)');
  printer.newLine();

  // eslint-disable-next-line no-unused-vars
  for (const [key, value] of Object.entries(cash)) {
    if (value.value !== 0) {
      printer.println(`${value.label} x ${value.value}`);
    }
  }

  printer.drawLine();
  printer.newLine();
  printer.alignLeft();
  printer.println(`Total      : ${fCurrency('', total.toFixed(2))}`);
  printer.newLine();

  printer.println(
    `Cashier    : ${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${
      cashReport.employeeId
    })`
  );
  printer.println(`Shift      : ${cashReport.shift}`);

  printer.println(`Date-time  : ${moment(cashReport.realTimeDate).format('MM/DD/YYYY hh:mm A')}`);

  printer.println(`Txn No.    : ${cashReport.txnNumber}`);

  printer.newLine();
  printer.alignCenter();
  printer.println(
    `${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${
      cashReport.employeeId
    })`
  );

  printer.newLine();
  printer.println('___________________________');
  printer.println("Cashier's Signature");

  printer.newLine();
  printer.println('TURNED OVER BY');

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

  if (settings[UnitConfig].devMode === true) {
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

exports.checkExistingCashTakeout = async (req, res, next) => {
  const { cashierId, transactionDate } = req.params;

  const [date] = transactionDate.split(' ');
  const [, startTime] = moment(transactionDate)
    .startOf('day')
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');
  const [, endTime] = moment(transactionDate).endOf('day').format('YYYY-MM-DD HH:mm:ss').split(' ');

  try {
    const cashTakeout = await CashLog.findOne({
      type: 'cash takeout',
      employeeId: cashierId,
      cashDate: {
        $gte: new Date(`${date}T${startTime}Z`),
        $lte: new Date(`${date}T${endTime}Z`)
      }
    });

    if (cashTakeout) {
      const error = new HttpError('Cashier already logged a cash takeout for today', 500);
      return next(error);
    }

    return res.status(204).json({ message: 'No cash takeout yet.' });
  } catch (err) {
    const error = new HttpError('Something went wrong on getting cash takeout.', 500);
    return next(error);
  }
};

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};
