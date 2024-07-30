const ssis = require('../../config/db/ssis');
const HttpError = require('../../middleware/http-error');
const timestamp = require('time-stamp');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const CashLog = require('../../models/CashLog');
const mongoose = require('mongoose');
const ActivityLog = require('../../models/ActivityLog');
const { generateNextActivityNumber } = require('../common/transaction');
const uniqid = require('uniqid');
const Transaction = require('../../models/Transaction');
const Preview = require('../../models/Preview');
const {
  getTxnNumber,
  getSiNumber,
  formatDate,
  getTotalCount
} = require('../../services/cash-logs/common');
const { checkCashLog, printInitialCash } = require('../../services/cash-logs/initialCashService');
const { SettingsCategoryEnum } = require('../common/settingsData');

exports.getInitialCashByBranchCode = (req, res, next) => {
  const { branchCode } = req.params;

  const connection = ssis();
  try {
    connection.query(
      `
         SELECT
          logs_id as logsId,
          peso_1000 as peso1000,
          peso_500 as peso500,
          peso_200 as peso200,
          peso_100 as peso100,
          peso_50 as peso50,
          peso_20 as peso20,
          peso_10 as peso10,
          peso_5 as peso5,
          peso_1 as peso1,
          cent_25 as cent25,
          cent_10 as cent10,
          cent_05 as cent05,
          cent_01 as cent01,
          total,
          cashier_id as employeeId,
          cashier_first_name as cashierFirstname,
          cashier_middle_name as cashierMiddlename,
          cashier_last_name as cashierLastname,
          shift,
          txn_number as txnNumber,
          date_created as dateCreated
        FROM
          _pos_reports_cash
        WHERE
          branch_code = "${branchCode}"
        AND
          type = "initial"
      `,
      function (err, result) {
        if (err) {
          const error = new HttpError(
            'Failed to get initial cash by branch code, please try again.',
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

exports.getInitialCashForToday = async (req, res, next) => {
  const { branchCode } = req.params;

  try {
    const cashlog = await CashLog.findOne({
      branchCode,
      type: 'initial',
      cashDate: new Date()
    });
    if (!cashlog)
      return next(
        new HttpError('Failed to get existed initital cash for today, please try again.', 500)
      );
    res.status(200).json({ data: cashlog });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);
    return next(error);
  }
};

exports.getUserInitialCashForToday = async (req, res, next) => {
  const { employeeId } = req.params;

  try {
    const cashLog = await CashLog.find({
      employeeId,
      type: 'initial',
      cashDate: {
        $gte: Date.now()
      }
    });

    if (!cashLog) {
      const error = new HttpError('no initial cash log found', 404);
      return next(error);
    }
    res.status(200).json({ data: cashLog ?? {} });
  } catch (err) {
    const error = new HttpError('Something went wrong, please try again.', 500);

    return next(error);
  }
};

exports.createInitialCash = async (req, res, next) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        posTransaction,
        activityLog,
        initialCash,
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

      const { date: activityDate, time: activityTime } = formatDate(activityLog.activityDate);
      //activity-log
      await ActivityLog.create(
        [
          {
            activityLogId: uniqid(activityLog.storeCode),
            transactionId: await generateNextActivityNumber(),
            firstName: activityLog.firstname,
            lastName: activityLog.lastname,
            employeeId: activityLog.employeeId,
            activity: activityLog.activity,
            description: `${activityLog.description.user.firstname} ${activityLog.description.user.lastname} has report a initial cash with an Transaction Number: ${txnNumber} and total amount of ${activityLog.description.total}.`,
            action: activityLog.action,
            storeCode: activityLog.storeCode,
            activityDate: new Date(`${activityDate}T${activityTime}Z`)
          }
        ],
        { session }
      );

      //initial-cash
      const { date: initialCashDate, time: initialCashTime } = formatDate(initialCash.cashDate);

      const isInitialCashExist = await checkCashLog(initialCashDate, initialCash);
      if (isInitialCashExist) {
          const error = new Error('Cashier has already logged an initial cash for today.');
          error.statusCode = 400;
          throw error;
      }

      const logId = `${initialCash.branchCode}-${timestamp('YYYYMMDDHHmmss')}`;
      const totalCount = getTotalCount(initialCash);

      const total = Object.values(totalCount).reduce((a, b) => a + b, 0);
      const totalWithDecimal = parseFloat(total.toFixed(2));

      await CashLog.create(
        [
          {
            reportCashLogId: logId,
            peso1000: initialCash.peso1000,
            peso500: initialCash.peso500,
            peso200: initialCash.peso200,
            peso100: initialCash.peso100,
            peso50: initialCash.peso50,
            peso20: initialCash.peso20,
            peso10: initialCash.peso10,
            peso5: initialCash.peso5,
            cent25: initialCash.cent25,
            cent10: initialCash.cent10,
            cent05: initialCash.cent05,
            cent01: initialCash.cent01,
            total: totalWithDecimal,
            employeeId: initialCash.employeeId,
            cashierFirstName: initialCash.cashierFirstName,
            cashierLastName: initialCash.cashierLastName,
            shift: initialCash.shift,
            txnNumber: txnNumber,
            type: 'initial',
            branchCode: initialCash.branchCode,
            cashDate: new Date(`${initialCashDate}T${initialCashTime}Z`)
          }
        ],
        { session }
      );

      if (!fromOutofSync) {
        //print
        await printInitialCash(printData);
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

    return res.status(200).json({ message: 'Successfully created new initial cash log.' });
  } catch (err) {
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

exports.printInitialCash = async (req, res, next) => {
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

  printer.clear();
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
  printer.println('I N I T I A L  C A S H');
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

exports.getInitialCashByUser = async (req, res, next) => {
  try {
    const { employeeId, posDate } = req.params;

    const cashLog = await CashLog.findOne({
      employeeId,
      type: 'initial',
      cashDate: {
        $gte: new Date(posDate)
      }
    });

    res.status(200).json({ data: cashLog ?? {} });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err);
    next(error);
  }
};

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};
