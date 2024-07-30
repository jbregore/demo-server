const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const CashLog = require('../../models/CashLog');
const { SettingsCategoryEnum } = require('../../controllers/common/settingsData');

const checkCashTakeout = async (shift, date, { startTime, endTime }) => {
  const hasCashTakeout = await CashLog.findOne({
    type: 'cash takeout',
    shift: shift,
    cashDate: {
      $gte: new Date(`${date}T${startTime}Z`),
      $lte: new Date(`${date}T${endTime}Z`)
    }
  });

  return hasCashTakeout;
};

const printCashTakeout = async (printData) => {
  let { apiData, settings } = printData;
  const { cashReport, total, isReprint } = apiData;
  const { UnitConfig, CompanyInfo } = SettingsCategoryEnum;

  if (!printData) {
    const error = new Error('No content to print.');
    error.statusCode = 400;
    throw error;
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
  } else {
    try {
      await printer.execute();
      console.log('Print success.');
    } catch (error) {
      console.error('Print error:', error);
    }
  }
};

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};

module.exports = {
  checkCashTakeout,
  printCashTakeout
};
