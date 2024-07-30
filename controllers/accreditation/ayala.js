const HttpError = require('../../middleware/http-error');
const Preview = require('../../models/Preview');
const { ThermalPrinter, types } = require('node-thermal-printer');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const Excel = require('exceljs');
const SMB2 = require('smb2');
const { Readable } = require('stream');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

// promisify all smb methods
const createDirectory = (smbClient, path) =>
  new Promise((resolve, reject) => {
    smbClient.mkdir(path, (err) => {
      if (err) {
        if (err.message === 'File/Folder already exists') {
          return resolve(true);
        }
        reject(err);
      }
      resolve(true);
    });
  });

const checkFile = (smbClient, path) =>
  new Promise((resolve, reject) => {
    smbClient.exists(path, (err, exists) => {
      if (err) {
        reject(err);
      }
      resolve(exists);
    });
  });

const writeFile = (smbClient, path, file) =>
  new Promise((resolve, reject) => {
    smbClient.writeFile(path, file, (err) => {
      if (err) reject(err);
      resolve(true);
    });
  });

const readFile = (smbClient, file) =>
  new Promise((resolve, reject) => {
    smbClient.readFile(file, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });

const checkExists = (smbClient, path) =>
  new Promise((resolve, reject) => {
    smbClient.exists(path, (err, exists) => {
      if (err) {
        console.log(err);
        smbClient.close();
        return reject(err);
      }

      resolve(exists);
    });
  });

// constants
const ayalaDailySalesHeaders = require('../../constants/ayalaDailySalesHeaders');
const ayalaHourlySalesHeaders = require('../../constants/ayalaHourlySalesHeaders');
const { SettingsCategoryEnum } = require('../common/settingsData');
const PaymentLog = require('../../models/PaymentLog');
const Transaction = require('../../models/Transaction');
const Ayala = require('../../models/Ayala');
const DiscountLog = require('../../models/DiscountLog');
const TransactionAmount = require('../../models/TransactionAmount');
const Order = require('../../models/Order');

exports.getZReadReport = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const { contractNumber } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { storeCode, devMode } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { printerName, printerWidth, terminalNumber } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};

    let printer = new ThermalPrinter({
      type: types.EPSON,
      interface: `//localhost/${printerName}`,
      width: printerWidth.width,
      removeSpecialCharacters: true,
      lineCharacter: '-'
    });

    const [year, month, day] = transactionDate.split('-');

    const data = await Preview.find({
      storeCode: storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);

    if (data?.length === 0) {
      const error = new HttpError('The current date you selected does not contain EOD yet.');
      return next(error);
    }

    // eslint-disable-next-line
    const { zReadData } = data[0]?.data;

    const DAILY_SALES = zReadData.payments.summary.total;
    const RAW_GROSS =
    // eslint-disable-next-line
      zReadData.SALES.net +
        zReadData.cashierAudit.VOID_TXN_AMOUNT +
        zReadData.cashierAudit.REFUND_TXN_AMOUNT ??
      0 + zReadData.cashierAudit.CANCELLED_TXN_AMOUNT ??
      0;
    const TOTAL_DISCOUNT_AMOUNT = zReadData.discounts.summary.total;
    const TOTAL_VOID = zReadData.cashierAudit.VOID_TXN_AMOUNT;
    const TOTAL_SERVICE_CHARGE = 0;
    const TOTAL_VAT = roundUpAmount(zReadData.vat.VAT_DETAILS.vatAmount);
    const TOTAL_NON_VAT = roundUpAmount(zReadData.vat.VAT_DETAILS.nonVatable);
    const TOTAL_TRANSACTION_COUNT = zReadData.cashierAudit.NUM_TOTAL_TXN;
    const TOTAL_CUSTOMERS = zReadData.cashierAudit.NUM_SALES_TXN;
    const TOTAL_REFUND = zReadData.cashierAudit.NUM_REFUND_TXN;

    // Folder name for year
    const urlPath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'AYALA',
      `${year}`,
      'existing',
      `EOD${terminalNumber.padStart(3, '0')}`
    );
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
    const fileName = `${contractNumber}${month}${day}Z.txt`;
    const writer = fs.createWriteStream(path.join(urlPath, fileName), {
      encoding: 'utf8'
    });

    writer.on('error', () => {
      const error = new HttpError('Something went wrong on writing the z-report file', 500);
      return next(error);
    });

    printer.newLine();
    printer.tableCustom([{ text: 'MERCHANT', align: 'CENTER' }]);
    printer.tableCustom([{ text: 'MALL NAME', align: 'CENTER' }]);
    printer.tableCustom([{ text: 'LOCATION', align: 'CENTER' }]);
    printer.newLine();
    printer.tableCustom([{ text: 'CONSOLIIDATED REPORT Z-READ', align: 'CENTER' }]);
    printer.newLine();
    printer.leftRight('Daily Sales', `${currencyFormat(DAILY_SALES)}`);
    printer.leftRight('Total Discount', `${currencyFormat(TOTAL_DISCOUNT_AMOUNT)}`);
    printer.leftRight('Total Refund', `${currencyFormat(TOTAL_REFUND)}`);
    printer.leftRight('Total Cancelled/Void', `${currencyFormat(TOTAL_VOID)}`);
    printer.leftRight('Total VAT', `${currencyFormat(TOTAL_VAT)}`);
    printer.leftRight('Total Service Charge', `${currencyFormat(TOTAL_SERVICE_CHARGE)}`);
    printer.leftRight('Total Non Taxable', `${currencyFormat(TOTAL_NON_VAT)}`);
    printer.leftRight('Raw Gross', `${currencyFormat(RAW_GROSS)}`);
    printer.leftRight('Transaction Count', `${TOTAL_TRANSACTION_COUNT}`);
    printer.leftRight('Customer Count', `${TOTAL_CUSTOMERS}`);
    printer.println('CASH');
    printer.println('DEBIT');
    printer.println('MASTERCARD');
    printer.println('VISA');
    printer.println('BIR PERMIT 1:');
    printer.println('SERIAL NO. 1:');
    printer.println('BIR PERMIT 2:');
    printer.println('SERIAL NO. 2:');
    printer.println('BIR PERMIT 3:');
    printer.println('SERIAL NO. 3:');
    printer.println('BIR PERMIT 4:');
    printer.println('SERIAL NO. 4:');
    printer.println('BIR PERMIT 5:');
    printer.println('SERIAL NO. 5:');
    printer.drawLine();
    printer.tableCustom([
      { text: `DATE: ${moment(transactionDate).format('MM/DD/YYYY')}`, align: 'CENTER' }
    ]);
    printer.newLine();
    printer.tableCustom([{ text: '*** END OF REPORT ***', align: 'CENTER' }]);
    writer.write('\ufeff'); // Write the UTF-8 BOM
    writer.write(printer.getText());
    writer.end();

    if (devMode) {
      console.log(`Z-Read file succesfully saved`);
    } else {
      try {
        await printer.execute();
        console.log(`Printing ayala z-report success`);
        return res.status(200).json({ message: 'Printing ayala z-report success' });
      } catch (err) {
        const error = new HttpError('Error printing on thermal printer', 500);
        next(error);
      }
    }

    if (!(ayalaHost && ayalaUser && ayalaPassword)) {
      return res
        .status(200)
        .json({ message: 'Successfully saved hourly sales file in local folder.' });
    }

    const client = new SMB2({
      share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
      domain: `${ayalaDomain}`,
      username: `${ayalaUser}`,
      password: `${ayalaPassword}`,
      autoCloseTimeout: 3000
    });

    const filePath = ['AYALA', `${year}`, 'existing', `EOD${terminalNumber.padStart(3, '0')}`];
    const filePathString = filePath.join('\\');

    // For checking connection only
    await checkExists(client, 'AYALA\\');

    let currentPath = '';
    for (let i = 0; i < filePath.length; i++) {
      try {
        await createDirectory(client, currentPath + `${filePath[i]}\\`);
      } catch (err) {
        console.log(`Error creating directory`);
      }

      currentPath = currentPath + `${filePath[i]}\\`;
    }

    const fileExists = await checkFile(client, `${filePathString}\\${fileName}`);

    if (!fileExists) {
      const file = fs.readFileSync(path.join(urlPath, fileName));
      await writeFile(client, `${filePathString}\\${fileName}`, file);
      return res
        .status(200)
        .json({ message: 'Local file saved. Z-Read data saved in other terminal' });
    } else {
      return res
        .status(200)
        .json({ message: 'Local file saved. Z-Read data already exists in other terminal' });
    }
  } catch (err) {
    console.log(err);
    console.log(`Err is `);
    if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
      return next(new HttpError('Cannot connect to other terminal. File sending failed'));
    const error = new HttpError('Something went wrong on saving/copying the Z-Read File.');
    return next(error);
  }
};

exports.getHourlySalesData = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const { terminalNumber, storeCode, contractNumber } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { contractName, ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};

    const formattedDate = moment(transactionDate).format('YYYY-MM-DD');
    const [year, month, day] = formattedDate.split('-');

    const data = await Preview.find({
      storeCode: storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${formattedDate}T00:00:00Z`),
        $lte: new Date(`${formattedDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);

    if (data?.length === 0) {
      const error = new HttpError('The current date you selected does not contain EOD yet.');
      return next(error);
    }

    const hourlySales = await PaymentLog.aggregate([
      {
        $match: {
          status: 'success',
          paymentDate: {
            $gte: new Date(`${formattedDate}T00:00:00Z`),
            $lte: new Date(`${formattedDate}T23:59:59Z`)
          },
          storeCode: storeCode
        }
      },
      {
        $group: {
          _id: { hour: { $hour: '$paymentDate' } },
          totalAmount: { $sum: '$amount' },
          countAmount: { $sum: 1 },
          payment_log_id: { $first: '$paymentLogId' }
        }
      },
      {
        $project: {
          _id: 0,
          hour: '$_id.hour',
          totalAmount: 1,
          countAmount: 1,
          status: 1,
          payment_log_id: 1
        }
      }
    ]);

    const nextTransactionDate = moment(transactionDate).add(1, 'day').format('YYYY-MM-DD');

    const nextHourlySales = await PaymentLog.aggregate([
      {
        $match: {
          status: 'success',
          paymentDate: {
            $gte: new Date(`${nextTransactionDate}T00:00:00Z`),
            $lte: new Date(`${nextTransactionDate}T23:59:59Z`)
          },
          storeCode: storeCode
        }
      },
      {
        $group: {
          _id: { hour: { $hour: '$paymentDate' } },
          totalAmount: { $sum: '$amount' },
          countAmount: { $sum: 1 },
          payment_log_id: { $first: '$paymentLogId' }
        }
      },
      {
        $project: {
          _id: 0,
          hour: '$_id.hour',
          totalAmount: 1,
          countAmount: 1,
          status: 1,
          payment_log_id: 1
        }
      }
    ]);

    // convert array to object
    const hourlySalesObj = hourlySales.reduce((acc, curr) => {
      return (acc = {
        ...acc,
        [`${curr.hour}`]: {
          totalAmount: curr.totalAmount,
          countAmount: curr.countAmount
        }
      });
    }, {});

    const nextHourlySalesObj = nextHourlySales.reduce((acc, curr) => {
      return (acc = {
        ...acc,
        [`${curr.hour}`]: {
          totalAmount: curr.totalAmount,
          countAmount: curr.countAmount
        }
      });
    }, {});

    const urlPath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'AYALA',
      `${year}`,
      'existing'
    );
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
    const fileName = `${contractNumber}${month}${day}H.txt`;
    const fileExists = fs.existsSync(path.join(urlPath, fileName));

    let stop = false;
    let log = '';
    const date = moment(transactionDate).format('MM/DD/YYYY');
    const nextDate = moment(transactionDate).add(1, 'day').format('MM/DD/YYYY');

    for (let hour = 6; hour < 24; hour++) {
      if (hour === 6 && stop) break;

      const hourStringFormat = hour < 10 ? hour.toString().padStart(2, '0') : hour;

      const amount = currencyFormat(
        stop
          ? nextHourlySalesObj[`${hour}`]?.totalAmount ?? 0
          : hourlySalesObj[`${hour}`]?.totalAmount ?? 0
      );
      const count = stop
        ? nextHourlySalesObj[`${hour}`]?.countAmount ?? 0
        : hourlySalesObj[`${hour}`]?.countAmount ?? 0;
      log += `${
        stop ? nextDate : date
      },${hourStringFormat}:00,${amount},${count},${contractName.toUpperCase()},${terminalNumber}\n`;

      if (hour === 23) {
        hour = -1;
        stop = true;
      }
    }

    if (!fileExists) {
      const writer = fs.createWriteStream(path.join(urlPath, fileName), {
        encoding: 'utf-8'
      });

      writer.on('error', () => {
        return res.status(500).json({ message: 'Failed writing hourly sales file.' });
      });

      // Write column headers
      writer.write('\ufeff'); // Write the UTF-8 BOM
      writer.write('TRANDATE,HOUR,SALES,TRANCNT,TENTNAME,TERMNUM\n');
      writer.write(log);
      writer.end();
    } else {
      // Check file first if it has already written its data on local folder
      const readTxtFile = () =>
        new Promise((resolve) => {
          let readData = '';
          let hasWritten = false;
          const readableStream = fs.createReadStream(path.join(urlPath, fileName), {
            encoding: 'utf-8'
          });

          readableStream.on('data', (chunk) => {
            readData += chunk;
          });

          readableStream.on('end', () => {
            console.log(`In end function.`);
            const lines = readData.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i];
              if (line.trim() !== '' && i > 0) {
                const values = line.split(',');
                if (values[values.length - 1] === terminalNumber) {
                  hasWritten = true;
                  break;
                }
              }
            }

            resolve(hasWritten);
          });
        });

      const hasWritten = await readTxtFile();

      // If file does not have data yet, but file already exists, append to the file
      if (!hasWritten) {
        fs.appendFileSync(path.join(urlPath, fileName), log);
      }
    }

    if (!(ayalaHost && ayalaUser && ayalaPassword)) {
      return res
        .status(200)
        .json({ message: 'Successfully saved hourly sales file in local folder.' });
    }

    // Send file to other terminal
    const client = new SMB2({
      share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
      domain: `${ayalaDomain}`,
      username: `${ayalaUser}`,
      password: `${ayalaPassword}`,
      autoCloseTimeout: 3000
    });

    const filePath = ['AYALA', `${year}`, 'existing'];
    const filePathString = filePath.join('\\');

    // For checking connection only
    await checkExists(client, 'AYALA\\');
    let currentPath = '';
    for (let i = 0; i < filePath.length; i++) {
      try {
        await createDirectory(client, currentPath + `${filePath[i]}\\`);
      } catch (err) {
        console.log(`Error creating directory`);
      }

      currentPath = currentPath + `${filePath[i]}\\`;
    }

    const remoteFileExists = await checkFile(client, `${filePathString}\\${fileName}`);

    if (!remoteFileExists) {
      const file = fs.readFileSync(path.join(urlPath, fileName));
      await writeFile(client, `${filePathString}\\${fileName}`, file);
      client.close();
      return res
        .status(200)
        .json({ message: 'Local file saved. Hourly sales file saved in other terminal' });
    } else {
      const data = await readFile(client, `${filePathString}\\${fileName}`);
      const stringData = data.toString();

      let hasWritten = false;
      const lines = stringData.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.trim() !== '' && i > 0) {
          const values = line.split(',');
          if (values[values.length - 1] === terminalNumber) {
            hasWritten = true;
            break;
          }
        }
      }

      if (hasWritten) {
        client.close();
        return res.status(200).json({
          message: 'Local file saved. Hourly sales data already exists in other terminal'
        });
      } else {
        const updatedData = stringData + log;
        await writeFile(client, `${filePathString}\\${fileName}`, updatedData);
        client.close();
        return res
          .status(200)
          .json({ message: 'Local file saved. Hourly sales data updated in other terminal' });
      }
    }
  } catch (err) {
    console.log('err ', err);
    if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
      return next(new HttpError('Cannot connect to other terminal. File sending failed'));
    const error = new HttpError('Something went wrong on saving/sending hourly sales file.');
    return next(error);
  }
};

exports.getDailySalesData = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const { terminalNumber, storeCode, contractNumber } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { contractName, ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};

    const [year, month, day] = transactionDate.split('-');

    const data = await Preview.find({
      storeCode: storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);

    if (data?.length === 0) {
      const error = new HttpError('The current date you selected does not contain EOD yet.');
      return next(error);
    }

    // eslint-disable-next-line
    const { zReadData } = data[0]?.data;

    const RAW_GROSS =
    // eslint-disable-next-line
      zReadData.SALES.net +
        zReadData.cashierAudit.VOID_TXN_AMOUNT +
        zReadData.cashierAudit.REFUND_TXN_AMOUNT ??
      0 + zReadData.cashierAudit.CANCELLED_TXN_AMOUNT ??
      0;
    const TOTAL_DISCOUNT_AMOUNT = zReadData.discounts.summary.total;
    const TOTAL_REFUND = zReadData.cashierAudit.REFUND_TXN_AMOUNT ?? 0;
    const TOTAL_VOID_CANCELLED =
    // eslint-disable-next-line
      zReadData.cashierAudit.VOID_TXN_AMOUNT ??
      0 + zReadData.cashierAudit.CANCELLED_TXN_AMOUNT ??
      0;
    const TOTAL_VAT = roundUpAmount(zReadData.vat.VAT_DETAILS.vatAmount);
    const TOTAL_SERVICE_CHARGE = 0;
    const DAILY_SALES =
      RAW_GROSS -
      TOTAL_DISCOUNT_AMOUNT -
      TOTAL_REFUND -
      TOTAL_VOID_CANCELLED -
      TOTAL_SERVICE_CHARGE -
      TOTAL_VAT;

    const TOTAL_NON_VAT = roundUpAmount(zReadData.vat.VAT_DETAILS.nonVatable);
    const TOTAL_TRANSACTION_COUNT = zReadData.cashierAudit.NUM_TOTAL_TXN;
    const OLD_TOTAL = zReadData.ACCUMULATED_SALES.old;
    const NEW_TOTAL = zReadData.ACCUMULATED_SALES.new;
    const BEGIN_INVOICE_NUMBER = zReadData.SI_NUM.from;
    const END_INVOICE_NUMBER = zReadData.SI_NUM.to;
    const BEGIN_OR_NUMBER = zReadData.SI_NUM.from;
    const END_OR_NUMBER = zReadData.SI_NUM.to;
    const LOCAL_TAXES = 0;
    const DAILY_LOCAL_TAX = 0;
    const OTHERS = 0;
    const TENT_NAME = contractName.toUpperCase();
    const TERMINAL_NUMBER = terminalNumber;

    const headers = [
      'TRANDATE',
      'OLDGT',
      'NEWGT',
      'DLYSALE',
      'TOTDISC',
      'TOTREF',
      'TOTCAN',
      'VAT',
      'TENTNAME',
      'BEGINV',
      'ENDINV',
      'BEGOR',
      'ENDOR',
      'TRANCNT',
      'LOCALTX',
      'SERVCHARGE',
      'NONTAXSALE',
      'RAWGROSS',
      'DLYLOCALTAX',
      'OTHERS',
      'TERMNUM'
    ];

    const values = [
      `${moment(transactionDate).format('MM/DD/YYYY')}`,
      `${currencyFormat(OLD_TOTAL)}`,
      `${currencyFormat(NEW_TOTAL)}`,
      `${currencyFormat(DAILY_SALES)}`,
      `${currencyFormat(TOTAL_DISCOUNT_AMOUNT)}`,
      `${currencyFormat(TOTAL_REFUND)}`,
      `${currencyFormat(TOTAL_VOID_CANCELLED)}`,
      `${currencyFormat(TOTAL_VAT)}`,
      `${TENT_NAME}`,
      `${BEGIN_INVOICE_NUMBER ?? 0}`,
      `${END_INVOICE_NUMBER ?? 0}`,
      `${BEGIN_OR_NUMBER ?? 0}`,
      `${END_OR_NUMBER ?? 0}`,
      `${TOTAL_TRANSACTION_COUNT}`,
      `${currencyFormat(LOCAL_TAXES)}`,
      `${currencyFormat(TOTAL_SERVICE_CHARGE)}`,
      `${currencyFormat(TOTAL_NON_VAT)}`,
      `${currencyFormat(RAW_GROSS)}`,
      `${currencyFormat(DAILY_LOCAL_TAX)}`,
      `${OTHERS}`,
      `${TERMINAL_NUMBER}`
    ];

    const urlPath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'AYALA',
      `${year}`,
      'existing'
    );
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
    const fileName = `${contractNumber}${month}${day}.txt`;
    const fileExists = fs.existsSync(path.join(urlPath, fileName));
    if (!fileExists) {
      const writer = fs.createWriteStream(path.join(urlPath, fileName), {
        encoding: 'utf-8'
      });

      writer.on('error', () => {
        const error = new HttpError('Something went wrong on writing the file');
        return next(error);
      });

      // Write in local folder
      writer.write('\ufeff'); // Write the UTF-8 BOM
      writer.write(headers.join(',') + '\n');
      writer.write(values.join(',') + '\n');
      writer.end();
    } else {
      const readTxtFile = () =>
        new Promise((resolve) => {
          let readData = '';
          let hasWritten = false;
          const readableStream = fs.createReadStream(path.join(urlPath, fileName), {
            encoding: 'utf-8'
          });

          readableStream.on('data', (chunk) => {
            readData += chunk;
          });

          readableStream.on('end', () => {
            const lines = readData.split('\n');
            for (let i = 0; i < lines.length - 1; i++) {
              const line = lines[i];
              if (line.trim() !== '' && i > 0) {
                const values = line.split(',');
                if (values[values.length - 1] === terminalNumber) {
                  hasWritten = true;
                  break;
                }
              }
            }

            resolve(hasWritten);
          });
        });

      const hasWritten = await readTxtFile();
      if (!hasWritten) {
        fs.appendFileSync(path.join(urlPath, fileName), values.join(',') + '\n');
      }
    }

    if (!(ayalaHost && ayalaUser && ayalaPassword)) {
      return res
        .status(200)
        .json({ message: 'Successfully saved hourly sales file in local folder.' });
    }

    // Write to shared folder (Two Terminal) in the other terminal
    // Send file to other terminal
    const client = new SMB2({
      share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
      domain: `${ayalaDomain}`,
      username: `${ayalaUser}`,
      password: `${ayalaPassword}`,
      autoCloseTimeout: 3000
    });

    const filePath = ['AYALA', `${year}`, 'existing'];
    const filePathString = filePath.join('\\');

    await checkExists(client, 'AYALA\\');

    let currentPath = '';
    for (let i = 0; i < filePath.length; i++) {
      try {
        await createDirectory(client, currentPath + `${filePath[i]}\\`);
      } catch (err) {
        console.log(`Error creating directory`);
      }
      currentPath = currentPath + `${filePath[i]}\\`;
    }

    const remoteFileExists = await checkFile(client, `${filePathString}\\${fileName}`);
    if (!remoteFileExists) {
      const file = fs.readFileSync(path.join(urlPath, fileName));
      await writeFile(client, `${filePathString}\\${fileName}`, file);
      client.close();
      return res
        .status(200)
        .json({ message: 'Local file saved. Daily Sales file saved in other terminal' });
    } else {
      const data = await readFile(client, `${filePathString}\\${fileName}`);
      const stringData = data.toString();

      let hasWritten = false;
      const lines = stringData.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.trim() !== '' && i > 0) {
          const values = line.split(',');
          if (values[values.length - 1] === terminalNumber) {
            hasWritten = true;
            break;
          }
        }
      }

      if (hasWritten) {
        client.close();
        return res
          .status(200)
          .json({ message: 'Local file saved. Daily Sales data already exists in other terminal' });
      } else {
        const updatedData = stringData + (values.join(',') + '\n');
        console.log(`Updated Data is `, updatedData);
        await writeFile(client, `${filePathString}\\${fileName}`, updatedData);
        client.close();
        return res
          .status(200)
          .json({ message: 'Local file saved. Daily Sales data updated in other terminal' });
      }
    }
  } catch (err) {
    if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
      return next(new HttpError('Cannot connect to other terminal. File sending failed'));
    const error = new HttpError('Something went wrong on saving/sending daily sales data.');
    return next(error);
  }
};

exports.getNewDailySalesData = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Daily Sales');

    // Write all left headers in column 1
    worksheet.getColumn(1).width = 20;
    worksheet.getColumn(1).values = ayalaDailySalesHeaders;
    const formattedDate = moment(transactionDate).format('YYYY-MM-DD');
    const startTime = moment().startOf('day').format('HH:mm:ss');
    const { contractNumber, companyCode, storeCode, terminalNumber } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { storeName } = settings[SettingsCategoryEnum.CompanyInfo] ?? {};
    const { ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const [year, ,] = formattedDate.split('-');

    // Get Z-read data
    const data = await Preview.find({
      storeCode: storeCode,
      type: 'z-read',
      transactionDate: {
        $gte: new Date(`${formattedDate}T00:00:00Z`),
        $lte: new Date(`${formattedDate}T23:59:59Z`)
      }
    }).maxTimeMS(300000);

    if (data?.length === 0) {
      const error = new HttpError('The current date you selected does not contain an EOD yet.');
      return next(error);
    }

    // Get the previous net sales on the previous z-reads
    const [prevNetSales] = await Preview.aggregate([
      {
        $match: {
          type: 'z-read'
        }
      },
      {
        $match: {
          transactionDate: {
            $lt: new Date(`${formattedDate}T${startTime}Z`)
          }
        }
      },
      {
        $group: {
          _id: null,
          netSales: {
            $sum: {
              $add: [
                '$data.zReadData.vat.VAT_DETAILS.vatableSales',
                '$data.zReadData.vat.VAT_DETAILS.nonVatable',
                '$data.zReadData.vat.VAT_DETAILS.vatExemptSales',
                '$data.zReadData.vat.VAT_DETAILS.vatAmount'
              ]
            }
          }
        }
      }
    ]);

    const [firstLastTxn] = await Ayala.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(`${formattedDate}T00:00:00Z`),
            $lte: new Date(`${formattedDate}T23:59:59Z`)
          }
        }
      },
      {
        $sort: {
          date: 1
        }
      },
      {
        $addFields: {
          dateString: {
            $dateToString: {
              date: '$date',
              format: '%Y-%m-%d'
            }
          }
        }
      },
      {
        $group: {
          _id: '$dateString',
          startTxn: {
            $first: '$start'
          },
          endTxn: {
            $last: '$end'
          }
        }
      }
    ]);

    console.log(`First Last TXN is `, firstLastTxn);

    const voidedPayments = await PaymentLog.aggregate([
      {
        $match: {
          status: 'void',
          paymentDate: {
            $gte: new Date(`${transactionDate}T00:00:00Z`),
            $lte: new Date(`${transactionDate}T23:59:59Z`)
          }
        }
      },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          method: '$_id',
          count: 1
        }
      }
    ]);

    const refundedReturnedPayments = await PaymentLog.aggregate([
      {
        $match: {
          status: { $in: ['refund', 'return'] },
          paymentDate: {
            $gte: new Date(`${transactionDate}T00:00:00Z`),
            $lte: new Date(`${transactionDate}T23:59:59Z`)
          }
        }
      },
      {
        $group: {
          _id: '$method',
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          method: '$_id',
          count: 1
        }
      }
    ]);

    const countVoidedPayments = {
      cash: { count: 0 },
      credit: { count: 0 },
      debit: { count: 0 },
      gcash: { count: 0 },
      paymaya: { count: 0 },
      giftCard: { count: 0 },
      others: { count: 0 }
    };

    voidedPayments.forEach((payment) => {
      if (payment.method === 'Cash') {
        countVoidedPayments.cash.count += payment.count;
      } else if (payment.method === 'Card (Mastercard)') {
        countVoidedPayments.credit.count += payment.count;
      } else if (payment.method === 'Card (EPS)') {
        countVoidedPayments.debit.count += payment.count;
      } else if (payment.method === 'GCash') {
        countVoidedPayments.gcash.count += payment.count;
      } else if (payment.method === 'Maya') {
        countVoidedPayments.paymaya.count += payment.count;
      } else if (payment.type !== '') {
        // For gift cards
        countVoidedPayments.giftCard.count += payment.count;
      } else {
        countVoidedPayments.others.count += payment.count;
      }
    });


    const { zReadData } = data[0].data;
    const scdpwdDiscounts = ['SCD', 'PWD', 'PWDPCKG', 'SCDPCKG', 'PNSTMD'];
    let totalSCDPWCDiscounts = 0;
    zReadData.discounts.DISCOUNT_ITEMS.forEach((discount) => {
      if (scdpwdDiscounts.includes(discount.discount)) {
        totalSCDPWCDiscounts += discount.total;
      }
    });

    // Get all values
    const COMPANY_CODE = `${companyCode}${contractNumber}`;
    const TRANS_DATE = `${formattedDate}`;
    const MERCHANT_NAME = storeName;
    const TERMINAL_NUMBER = parseInt(terminalNumber).toString().padStart(3, '0');
    const START_TRANS = `${(firstLastTxn?.startTxn ?? 0).toString().padStart(15, '0')}`;
    const END_TRANS = `${(firstLastTxn?.endTxn ?? 0).toString().padStart(15, '0')}`;
    const VAT_AMOUNT = zReadData?.vat.VAT_DETAILS.vatAmount ?? 0;
    const VATABLE_SALES = zReadData?.vat.VAT_DETAILS.vatableSales ?? 0;
    const NONVAT_SALES = zReadData?.vat.VAT_DETAILS.nonVatable ?? 0;
    const VAT_EXEMPT_SALES =
      (zReadData?.vat.VAT_DETAILS.vatExemptSales ?? 0) +
      (zReadData?.vat.VAT_DETAILS.vatZeroRated ?? 0) -
      totalSCDPWCDiscounts;
    const VAT_EXEMPT_AMOUNT = zReadData?.vat.total ?? 0;
    const OLD_GRAND_TOTAL = prevNetSales?.netSales ?? 0;
    const NEW_GRAND_TOTAL =
      OLD_GRAND_TOTAL + VAT_AMOUNT + VATABLE_SALES + NONVAT_SALES + VAT_EXEMPT_SALES;
    const LOCAL_TAX = 0;
    const TOTAL_VOID = zReadData?.cashierAudit.VOID_TXN_AMOUNT ?? 0;
    const NO_VOID = zReadData?.cashierAudit.NUM_VOID_TXN ?? 0;
    const TOTAL_DISCOUNTS = zReadData?.discounts.summary.total;
    const NO_DISCOUNTS = zReadData?.discounts.summary.count;
    const TOTAL_REFUND = zReadData.cashierAudit.REFUND_TXN_AMOUNT ?? 0;
    const NO_REFUND = zReadData.cashierAudit.NUM_REFUND_TXN ?? 0;
    // eslint-disable-next-line
    const GROSS_SALES = zReadData.SALES.net + zReadData.cashierAudit.VOID_TXN_AMOUNT + zReadData.cashierAudit.REFUND_TXN_AMOUNT ?? 0 + zReadData.cashierAudit.CANCELLED_TXN_AMOUNT ?? 0

    const SENIOR_CITIZEN_DISCOUNT =
      zReadData.discounts.DISCOUNT_ITEMS.find((item) => item.discount === 'SCD')?.total ?? 0;
    const NO_SENIOR_CITIZEN_DISCOUNTS =
      zReadData.discounts.DISCOUNT_ITEMS.find((item) => item.discount === 'SCD')?.count ?? 0;
    const PWD_DISCOUNTS =
      zReadData.discounts.DISCOUNT_ITEMS.find((item) => item.discount === 'PWD')?.total ?? 0;
    const NO_PWD_DISCOUNTS =
      zReadData.discounts.DISCOUNT_ITEMS.find((item) => item.discount === 'PWD')?.count ?? 0;
    const EMPLOYEE_DISCOUNTS = 0;
    const NO_EMPLOYEE_DISCOUNTS = 0;
    const AYALA_DISCOUNTS = 0;
    const NO_AYALA_DISCOUNTS = 0;
    const STORE_DISCOUNTS = 0;
    const NO_STORE_DISCOUNTS = 0;
    const OTHER_DISCOUNTS =
    // eslint-disable-next-line
      zReadData.discounts.summary.total - SENIOR_CITIZEN_DISCOUNT - PWD_DISCOUNTS ?? 0;
    const NO_OTHER_DISCOUNTS =
    // eslint-disable-next-line
      zReadData.discounts.summary.count - NO_SENIOR_CITIZEN_DISCOUNTS - NO_PWD_DISCOUNTS ?? 0;
    const SERVICE_CHARGES = 0;
    const OTHER_SERVICE_CHARGES = 0;
    const CASH_SALES = zReadData?.payments.cash.total ?? 0;
    const CARD_SALES = zReadData?.payments.nonCash.cards.CREDIT_CARD.total ?? 0;
    const EPAY_SALES =
      (zReadData?.payments.nonCash.eWallets.GCASH.total ?? 0) +
      (zReadData?.payments.nonCash.eWallets.MAYA.total ?? 0);
    const DEBIT_CARD_SALES = zReadData?.payments.nonCash.cards.DEBIT_CARD.total ?? 0;
    const GIFT_VOUCHER_SALES = zReadData?.payments.nonCash.giftCards.summary.total ?? 0;
    const GCASH_SALES = zReadData?.payments.nonCash.eWallets.GCASH.total ?? 0;
    const PAYMAYA_SALES = zReadData?.payments.nonCash.eWallets.MAYA.total ?? 0;
    const OTHER_SALES =
      currencyFormat(
        zReadData.payments.summary.total -
          CASH_SALES -
          CARD_SALES -
          DEBIT_CARD_SALES -
          GIFT_VOUCHER_SALES -
          GCASH_SALES -
          PAYMAYA_SALES
      ) ?? 0;
    const CHECK_SALES = 0;
    const MASTERCARD_SALES = zReadData?.payments.nonCash.cards.CREDIT_CARD.total ?? 0;
    const VISA_SALES = 0;
    const AMEX_SALES = 0;
    const DINERS_SALES = 0;
    const JCB_SALES = 0;
    const ALIPAY_SALES = 0;
    const WECHAT_SALES = 0;
    const GRAB_SALES = 0;
    const FOODPANDA_SALES = 0;
    const MASTERDEBIT_SALES = zReadData?.payments.nonCash.cards.DEBIT_CARD.total ?? 0;
    const VISADEBIT_SALES = 0;
    const PAYPAL_SALES = 0;
    const ONLINE_SALES = 0;
    const OPEN_SALES = 0;
    const OPEN_SALES2 = 0;
    const OPEN_SALES3 = 0;
    const OPEN_SALES4 = 0;
    const OPEN_SALES5 = 0;
    const OPEN_SALES6 = 0;
    const OPEN_SALES7 = 0;
    const OPEN_SALES8 = 0;
    const OPEN_SALES9 = 0;
    const OPEN_SALES10 = 0;
    const OPEN_SALES11 = 0;
    const GIFT_VOUCHER_EXCESS = zReadData.payments.nonCash.giftCards.summary.EXCESS_GC;
    const NO_VATEXEMPT = NO_SENIOR_CITIZEN_DISCOUNTS + NO_PWD_DISCOUNTS;
    const NO_SERVICE_CHARGE = 0;
    const NO_OTHER_SERVICE_CHARGE = 0;
    const NO_CASH = zReadData?.payments.cash.count + countVoidedPayments.cash.count;
    const NO_CARD =
      (zReadData?.payments.nonCash.cards.CREDIT_CARD.count ?? 0) + countVoidedPayments.credit.count;
    const NO_EPAY =
      (zReadData?.payments.nonCash.eWallets.GCASH.count ?? 0) +
      (zReadData?.payments.nonCash.eWallets.MAYA.count ?? 0) +
      countVoidedPayments.gcash.count +
      countVoidedPayments.paymaya.count;
    const NO_DEBIT_CARD =
      (zReadData?.payments.nonCash.cards.DEBIT_CARD.count ?? 0) + countVoidedPayments.debit.count;
    const NO_OTHER_SALES =
      zReadData.payments.summary.count -
      zReadData?.payments.cash.count -
      zReadData?.payments.nonCash.cards.CREDIT_CARD.count -
      zReadData?.payments.nonCash.cards.DEBIT_CARD.count -
      zReadData?.payments.nonCash.giftCards.summary.count -
      zReadData?.payments.nonCash.eWallets.GCASH.count -
      zReadData?.payments.nonCash.eWallets.MAYA.count +
      countVoidedPayments.others.count;
    const NO_CHECK = 0;
    const NO_GC =
      zReadData?.payments.nonCash.giftCards.summary.count + countVoidedPayments.giftCard.count;
    const NO_MASTERCARD =
      (zReadData?.payments.nonCash.cards.CREDIT_CARD.count ?? 0) + countVoidedPayments.credit.count;
    const NO_VISA = 0;
    const NO_AMEX = 0;
    const NO_DINERS = 0;
    const NO_JCB = 0;
    const NO_GCASH =
      (zReadData?.payments.nonCash.eWallets.GCASH.count ?? 0) + countVoidedPayments.gcash.count;
    const NO_PAYMAYA =
      (zReadData?.payments.nonCash.eWallets.MAYA.count ?? 0) + countVoidedPayments.paymaya.count;
    const NO_ALIPAY = 0;
    const NO_WECHAT = 0;
    const NO_GRAB = 0;
    const NO_FOODPANDA = 0;
    const NO_MASTERDEBIT =
      (zReadData?.payments.nonCash.cards.DEBIT_CARD.count ?? 0) + countVoidedPayments.debit.count;
    const NO_VISADEBIT = 0;
    const NO_PAYPAL = 0;
    const NO_ONLINE = 0;
    const NO_OPEN_SALES1 = 0;
    const NO_OPEN_SALES2 = 0;
    const NO_OPEN_SALES3 = 0;
    const NO_OPEN_SALES4 = 0;
    const NO_OPEN_SALES5 = 0;
    const NO_OPEN_SALES6 = 0;
    const NO_OPEN_SALES7 = 0;
    const NO_OPEN_SALES8 = 0;
    const NO_OPEN_SALES9 = 0;
    const NO_OPEN_SALES10 = 0;
    const NO_OPEN_SALES11 = 0;
    const NO_NOSALE = zReadData.SALES.net > 0 ? 0 : 1;
    const NO_CUST = zReadData.cashierAudit.NUM_SALES_TXN;
    const NO_TRANSACTIONS =
      zReadData.cashierAudit.NUM_SALES_TXN +
      (voidedPayments.length ?? 0) +
      (refundedReturnedPayments.length ?? 0) +
      (zReadData?.cashierAudit.NUM_VOID_TXN ?? 0) +
      (zReadData?.cashierAudit.NUM_REFUND_TXN ?? 0) +
      zReadData.payments.nonCash.returns.RMES_ISSUANCE.count;
    const PREVIOUS_EOD_COUNTER =
      zReadData.zReadLogsCount > 0 ? zReadData.zReadLogsCount - 1 : zReadData.zReadLogsCount;
    const EOD_COUNT = zReadData.zReadLogsCount;

    worksheet.getColumn(2).width = 20;
    worksheet.getColumn(2).alignment = { horizontal: 'right' };
    worksheet.getColumn(2).values = [
      COMPANY_CODE,
      MERCHANT_NAME,
      TERMINAL_NUMBER,
      TRANS_DATE,
      START_TRANS,
      END_TRANS,
      parseFloat(GROSS_SALES).toFixed(2),
      parseFloat(VAT_AMOUNT).toFixed(2),
      parseFloat(VATABLE_SALES).toFixed(2),
      parseFloat(NONVAT_SALES).toFixed(2),
      parseFloat(VAT_EXEMPT_SALES).toFixed(2),
      parseFloat(VAT_EXEMPT_AMOUNT).toFixed(2),
      parseFloat(OLD_GRAND_TOTAL).toFixed(2),
      parseFloat(NEW_GRAND_TOTAL).toFixed(2),
      parseFloat(LOCAL_TAX).toFixed(2),
      parseFloat(TOTAL_VOID).toFixed(2),
      NO_VOID,
      parseFloat(TOTAL_DISCOUNTS).toFixed(2),
      NO_DISCOUNTS,
      parseFloat(TOTAL_REFUND).toFixed(2),
      NO_REFUND,
      parseFloat(SENIOR_CITIZEN_DISCOUNT).toFixed(2),
      NO_SENIOR_CITIZEN_DISCOUNTS,
      parseFloat(PWD_DISCOUNTS).toFixed(2),
      NO_PWD_DISCOUNTS,
      parseFloat(EMPLOYEE_DISCOUNTS).toFixed(2),
      NO_EMPLOYEE_DISCOUNTS,
      parseFloat(AYALA_DISCOUNTS).toFixed(2),
      NO_AYALA_DISCOUNTS,
      parseFloat(STORE_DISCOUNTS).toFixed(2),
      NO_STORE_DISCOUNTS,
      parseFloat(OTHER_DISCOUNTS).toFixed(2),
      NO_OTHER_DISCOUNTS,
      parseFloat(SERVICE_CHARGES).toFixed(2),
      parseFloat(OTHER_SERVICE_CHARGES).toFixed(2),
      parseFloat(CASH_SALES).toFixed(2),
      parseFloat(CARD_SALES).toFixed(2),
      parseFloat(EPAY_SALES).toFixed(2),
      parseFloat(DEBIT_CARD_SALES).toFixed(2),
      parseFloat(OTHER_SALES).toFixed(2),
      parseFloat(CHECK_SALES).toFixed(2),
      parseFloat(GIFT_VOUCHER_SALES).toFixed(2),
      parseFloat(MASTERCARD_SALES).toFixed(2),
      parseFloat(VISA_SALES).toFixed(2),
      parseFloat(AMEX_SALES).toFixed(2),
      parseFloat(DINERS_SALES).toFixed(2),
      parseFloat(JCB_SALES).toFixed(2),
      parseFloat(GCASH_SALES).toFixed(2),
      parseFloat(PAYMAYA_SALES).toFixed(2),
      parseFloat(ALIPAY_SALES).toFixed(2),
      parseFloat(WECHAT_SALES).toFixed(2),
      parseFloat(GRAB_SALES).toFixed(2),
      parseFloat(FOODPANDA_SALES).toFixed(2),
      parseFloat(MASTERDEBIT_SALES).toFixed(2),
      parseFloat(VISADEBIT_SALES).toFixed(2),
      parseFloat(PAYPAL_SALES).toFixed(2),
      parseFloat(ONLINE_SALES).toFixed(2),
      parseFloat(OPEN_SALES).toFixed(2),
      parseFloat(OPEN_SALES2).toFixed(2),
      parseFloat(OPEN_SALES3).toFixed(2),
      parseFloat(OPEN_SALES4).toFixed(2),
      parseFloat(OPEN_SALES5).toFixed(2),
      parseFloat(OPEN_SALES6).toFixed(2),
      parseFloat(OPEN_SALES7).toFixed(2),
      parseFloat(OPEN_SALES8).toFixed(2),
      parseFloat(OPEN_SALES9).toFixed(2),
      parseFloat(OPEN_SALES10).toFixed(2),
      parseFloat(OPEN_SALES11).toFixed(2),
      parseFloat(GIFT_VOUCHER_EXCESS).toFixed(2),
      NO_VATEXEMPT,
      NO_SERVICE_CHARGE,
      NO_OTHER_SERVICE_CHARGE,
      NO_CASH,
      NO_CARD,
      NO_EPAY,
      NO_DEBIT_CARD,
      NO_OTHER_SALES,
      NO_CHECK,
      NO_GC,
      NO_MASTERCARD,
      NO_VISA,
      NO_AMEX,
      NO_DINERS,
      NO_JCB,
      NO_GCASH,
      NO_PAYMAYA,
      NO_ALIPAY,
      NO_WECHAT,
      NO_GRAB,
      NO_FOODPANDA,
      NO_MASTERDEBIT,
      NO_VISADEBIT,
      NO_PAYPAL,
      NO_ONLINE,
      NO_OPEN_SALES1,
      NO_OPEN_SALES2,
      NO_OPEN_SALES3,
      NO_OPEN_SALES4,
      NO_OPEN_SALES5,
      NO_OPEN_SALES6,
      NO_OPEN_SALES7,
      NO_OPEN_SALES8,
      NO_OPEN_SALES9,
      NO_OPEN_SALES10,
      NO_OPEN_SALES11,
      NO_NOSALE,
      NO_CUST,
      NO_TRANSACTIONS,
      PREVIOUS_EOD_COUNTER,
      EOD_COUNT
    ];
    worksheet.getCell('B4').numFmt = 'YYYY-MM-DD';

    const fileName = `EOD${companyCode}${contractNumber}${moment(transactionDate).format(
      'MMDDYY'
    )}.csv`;

    // Write/Update CSV to local folder
    const urlPath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'AYALA',
      `${year}`,
      'new requirements'
    );
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
    const fileExists = fs.existsSync(path.join(urlPath, fileName));

    if (!fileExists) {
      await workbook.csv.writeFile(path.join(urlPath, fileName), {
        formatterOptions: {
          quote: false
        }
      });
    } else {
      // Check if terminal already has data in the csv file
      const wb = new Excel.Workbook();
      const ws = await wb.csv.readFile(path.join(urlPath, fileName));
      const column1TermNum = ws.getCell('B3').value?.toString();
      const column2TermNum = ws.getCell('C3').value?.toString();
      if (!(column1TermNum === terminalNumber || column2TermNum === terminalNumber)) {
        //  the csv parses the data, some of the numbers saved as strings will be read as numbers
        ws.getCell('B4').value = moment(ws.getCell('B4').value).format('YYYY-MM-DD');
        ws.getCell('B5').value = ws.getCell('B5').value.toString().padStart(15, '0');
        ws.getCell('B6').value = ws.getCell('B6').value.toString().padStart(15, '0');

        ws.getColumn(3).width = 20;
        ws.getColumn(3).alignment = { horizontal: 'right' };
        ws.getColumn(3).values = [
          COMPANY_CODE,
          MERCHANT_NAME,
          TERMINAL_NUMBER,
          TRANS_DATE,
          START_TRANS,
          END_TRANS,
          parseFloat(GROSS_SALES).toFixed(2),
          parseFloat(VAT_AMOUNT).toFixed(2),
          parseFloat(VATABLE_SALES).toFixed(2),
          parseFloat(NONVAT_SALES).toFixed(2),
          parseFloat(VAT_EXEMPT_SALES).toFixed(2),
          parseFloat(VAT_EXEMPT_AMOUNT).toFixed(2),
          parseFloat(OLD_GRAND_TOTAL).toFixed(2),
          parseFloat(NEW_GRAND_TOTAL).toFixed(2),
          parseFloat(LOCAL_TAX).toFixed(2),
          parseFloat(TOTAL_VOID).toFixed(2),
          NO_VOID,
          parseFloat(TOTAL_DISCOUNTS).toFixed(2),
          NO_DISCOUNTS,
          parseFloat(TOTAL_REFUND).toFixed(2),
          NO_REFUND,
          parseFloat(SENIOR_CITIZEN_DISCOUNT).toFixed(2),
          NO_SENIOR_CITIZEN_DISCOUNTS,
          parseFloat(PWD_DISCOUNTS).toFixed(2),
          NO_PWD_DISCOUNTS,
          parseFloat(EMPLOYEE_DISCOUNTS).toFixed(2),
          NO_EMPLOYEE_DISCOUNTS,
          parseFloat(AYALA_DISCOUNTS).toFixed(2),
          NO_AYALA_DISCOUNTS,
          parseFloat(STORE_DISCOUNTS).toFixed(2),
          NO_STORE_DISCOUNTS,
          parseFloat(OTHER_DISCOUNTS).toFixed(2),
          NO_OTHER_DISCOUNTS,
          parseFloat(SERVICE_CHARGES).toFixed(2),
          parseFloat(OTHER_SERVICE_CHARGES).toFixed(2),
          parseFloat(CASH_SALES).toFixed(2),
          parseFloat(CARD_SALES).toFixed(2),
          parseFloat(EPAY_SALES).toFixed(2),
          parseFloat(DEBIT_CARD_SALES).toFixed(2),
          parseFloat(OTHER_SALES).toFixed(2),
          parseFloat(CHECK_SALES).toFixed(2),
          parseFloat(GIFT_VOUCHER_SALES).toFixed(2),
          parseFloat(MASTERCARD_SALES).toFixed(2),
          parseFloat(VISA_SALES).toFixed(2),
          parseFloat(AMEX_SALES).toFixed(2),
          parseFloat(DINERS_SALES).toFixed(2),
          parseFloat(JCB_SALES).toFixed(2),
          parseFloat(GCASH_SALES).toFixed(2),
          parseFloat(PAYMAYA_SALES).toFixed(2),
          parseFloat(ALIPAY_SALES).toFixed(2),
          parseFloat(WECHAT_SALES).toFixed(2),
          parseFloat(GRAB_SALES).toFixed(2),
          parseFloat(FOODPANDA_SALES).toFixed(2),
          parseFloat(MASTERDEBIT_SALES).toFixed(2),
          parseFloat(VISADEBIT_SALES).toFixed(2),
          parseFloat(PAYPAL_SALES).toFixed(2),
          parseFloat(ONLINE_SALES).toFixed(2),
          parseFloat(OPEN_SALES).toFixed(2),
          parseFloat(OPEN_SALES2).toFixed(2),
          parseFloat(OPEN_SALES3).toFixed(2),
          parseFloat(OPEN_SALES4).toFixed(2),
          parseFloat(OPEN_SALES5).toFixed(2),
          parseFloat(OPEN_SALES6).toFixed(2),
          parseFloat(OPEN_SALES7).toFixed(2),
          parseFloat(OPEN_SALES8).toFixed(2),
          parseFloat(OPEN_SALES9).toFixed(2),
          parseFloat(OPEN_SALES10).toFixed(2),
          parseFloat(OPEN_SALES11).toFixed(2),
          parseFloat(GIFT_VOUCHER_EXCESS).toFixed(2),
          NO_VATEXEMPT,
          NO_SERVICE_CHARGE,
          NO_OTHER_SERVICE_CHARGE,
          NO_CASH,
          NO_CARD,
          NO_EPAY,
          NO_DEBIT_CARD,
          NO_OTHER_SALES,
          NO_CHECK,
          NO_GC,
          NO_MASTERCARD,
          NO_VISA,
          NO_AMEX,
          NO_DINERS,
          NO_JCB,
          NO_GCASH,
          NO_PAYMAYA,
          NO_ALIPAY,
          NO_WECHAT,
          NO_GRAB,
          NO_FOODPANDA,
          NO_MASTERDEBIT,
          NO_VISADEBIT,
          NO_PAYPAL,
          NO_ONLINE,
          NO_OPEN_SALES1,
          NO_OPEN_SALES2,
          NO_OPEN_SALES3,
          NO_OPEN_SALES4,
          NO_OPEN_SALES5,
          NO_OPEN_SALES6,
          NO_OPEN_SALES7,
          NO_OPEN_SALES8,
          NO_OPEN_SALES9,
          NO_OPEN_SALES10,
          NO_OPEN_SALES11,
          NO_NOSALE,
          NO_CUST,
          NO_TRANSACTIONS,
          PREVIOUS_EOD_COUNTER,
          EOD_COUNT
        ];
        await wb.csv.writeFile(path.join(urlPath, fileName), {
          formatterOptions: {
            quote: false
          }
        });
      }
    }

    if (!(ayalaHost && ayalaUser && ayalaPassword)) {
      return res
        .status(200)
        .json({ message: 'Successfully saved hourly sales file in local folder.' });
    }

    // Send file to other terminal
    const client = new SMB2({
      share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
      domain: `${ayalaDomain}`,
      username: `${ayalaUser}`,
      password: `${ayalaPassword}`,
      autoCloseTimeout: 3000
    });

    const filePath = ['AYALA', `${year}`, 'new requirements'];
    const filePathString = filePath.join('\\');

    await checkExists(client, 'AYALA\\');
    let currentPath = '';
    for (let i = 0; i < filePath.length; i++) {
      try {
        await createDirectory(client, currentPath + `${filePath[i]}\\`);
      } catch (err) {
        console.log(`Error creating directory`);
      }

      currentPath = currentPath + `${filePath[i]}\\`;
    }

    const remoteFileExists = await checkFile(client, `${filePathString}\\${fileName}`);

    if (!remoteFileExists) {
      const file = fs.readFileSync(path.join(urlPath, fileName));
      await writeFile(client, `${filePathString}\\${fileName}`, file);
      client.close();
      return res
        .status(200)
        .json({ message: 'Local file saved. New Daily Sales file saved in other terminal' });
    } else {
      const data = await readFile(client, `${filePathString}\\${fileName}`);
      const csvStream = new Readable();
      csvStream.push(data);
      csvStream.push(null);

      const wb = new Excel.Workbook();
      const ws = await wb.csv.read(csvStream);

      const column1TermNum = ws.getCell('B3').value?.toString();
      const column2TermNum = ws.getCell('C3').value?.toString();

      if (column1TermNum === terminalNumber || column2TermNum === terminalNumber) {
        client.close();
        return res.status(200).json({
          message: 'Local file saved. New Daily Sales data already exists in the other terminal.'
        });
      } else {
        // Since reading the csv parses the data, some of the numbers saved as strings will be read as numbers
        ws.getCell('B4').value = moment(ws.getCell('B4').value).format('YYYY-MM-DD');
        ws.getCell('B5').value = ws.getCell('B5').value.toString().padStart(15, '0');
        ws.getCell('B6').value = ws.getCell('B6').value.toString().padStart(15, '0');

        ws.getColumn(3).width = 20;
        ws.getColumn(3).alignment = { horizontal: 'right' };
        ws.getColumn(3).values = [
          COMPANY_CODE,
          MERCHANT_NAME,
          TERMINAL_NUMBER,
          TRANS_DATE,
          START_TRANS,
          END_TRANS,
          GROSS_SALES,
          VAT_AMOUNT,
          VATABLE_SALES,
          NONVAT_SALES,
          VAT_EXEMPT_SALES,
          VAT_EXEMPT_AMOUNT,
          OLD_GRAND_TOTAL,
          NEW_GRAND_TOTAL,
          LOCAL_TAX,
          TOTAL_VOID,
          NO_VOID,
          TOTAL_DISCOUNTS,
          NO_DISCOUNTS,
          TOTAL_REFUND,
          NO_REFUND,
          SENIOR_CITIZEN_DISCOUNT,
          NO_SENIOR_CITIZEN_DISCOUNTS,
          PWD_DISCOUNTS,
          NO_PWD_DISCOUNTS,
          EMPLOYEE_DISCOUNTS,
          NO_EMPLOYEE_DISCOUNTS,
          AYALA_DISCOUNTS,
          NO_AYALA_DISCOUNTS,
          STORE_DISCOUNTS,
          NO_STORE_DISCOUNTS,
          OTHER_DISCOUNTS,
          NO_OTHER_DISCOUNTS,
          SERVICE_CHARGES,
          OTHER_SERVICE_CHARGES,
          CASH_SALES,
          CARD_SALES,
          EPAY_SALES,
          DEBIT_CARD_SALES,
          OTHER_SALES,
          CHECK_SALES,
          GIFT_VOUCHER_SALES,
          MASTERCARD_SALES,
          VISA_SALES,
          AMEX_SALES,
          DINERS_SALES,
          JCB_SALES,
          GCASH_SALES,
          PAYMAYA_SALES,
          ALIPAY_SALES,
          WECHAT_SALES,
          GRAB_SALES,
          FOODPANDA_SALES,
          MASTERDEBIT_SALES,
          VISADEBIT_SALES,
          PAYPAL_SALES,
          ONLINE_SALES,
          OPEN_SALES,
          OPEN_SALES2,
          OPEN_SALES3,
          OPEN_SALES4,
          OPEN_SALES5,
          OPEN_SALES6,
          OPEN_SALES7,
          OPEN_SALES8,
          OPEN_SALES9,
          OPEN_SALES10,
          OPEN_SALES11,
          GIFT_VOUCHER_EXCESS,
          NO_VATEXEMPT,
          NO_SERVICE_CHARGE,
          NO_OTHER_SERVICE_CHARGE,
          NO_CASH,
          NO_CARD,
          NO_EPAY,
          NO_DEBIT_CARD,
          NO_OTHER_SALES,
          NO_CHECK,
          NO_GC,
          NO_MASTERCARD,
          NO_VISA,
          NO_AMEX,
          NO_DINERS,
          NO_JCB,
          NO_GCASH,
          NO_PAYMAYA,
          NO_ALIPAY,
          NO_WECHAT,
          NO_GRAB,
          NO_FOODPANDA,
          NO_MASTERDEBIT,
          NO_VISADEBIT,
          NO_PAYPAL,
          NO_ONLINE,
          NO_OPEN_SALES1,
          NO_OPEN_SALES2,
          NO_OPEN_SALES3,
          NO_OPEN_SALES4,
          NO_OPEN_SALES5,
          NO_OPEN_SALES6,
          NO_OPEN_SALES7,
          NO_OPEN_SALES8,
          NO_OPEN_SALES9,
          NO_OPEN_SALES10,
          NO_OPEN_SALES11,
          NO_NOSALE,
          NO_CUST,
          NO_TRANSACTIONS,
          PREVIOUS_EOD_COUNTER,
          EOD_COUNT
        ];
        const updatedBuffer = await wb.csv.writeBuffer();
        await writeFile(client, `${filePathString}\\${fileName}`, updatedBuffer);
        client.close();
        return res
          .status(200)
          .json({ message: 'Local file saved. New Daily Sales updated in other terminal.' });
      }
    }
  } catch (err) {
    console.log(err);
    if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
      return next(new HttpError(err, req, 'Cannot connect to other terminal. File sending failed'));
    // const error = new HttpError(
    //   err,
    //   req,
    //   'Something went wrong on saving/sending the local file to other terminal.'
    // );
    // next(error);
    return res.send(err.message);
  }
};

exports.getNewHourlySalesData = async (req, res, next) => {
  try {
    // */5 for every 5 seconds
    // cron.schedule('0 0 * * * *', async () => {
    //   try {
    //     const settings = await Settings.findOne({});
    //     const { storeCode, contractNumber, companyCode, startingDate, terminalNumber } =
    //       settings[SettingsCategoryEnum.UnitConfig] ?? {};
    //     let transactionDate = startingDate;
    //     const CCCODE = companyCode + contractNumber;
    //     let hour = moment().hour();
    //     const year = moment().year();
    //     const { ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
    //       settings[SettingsCategoryEnum.UnitConfig] ?? {};
    //     const { storeName } = settings[SettingsCategoryEnum.CompanyInfo] ?? {};

    //     // Get latest pos date
    //     const latestZRead = await ReadLog.find({
    //       store_code: storeCode,
    //       type: 'z-read'
    //     })
    //       .select({ read_date: 'readDate' })
    //       .sort({ read_date: -1 })
    //       .limit(1);

    //     const latestReadDate = latestZRead[0]?.readDate;
    //     if (latestReadDate) {
    //       transactionDate = moment(latestReadDate)
    //         .add(1, 'day')
    //         .startOf('day')
    //         .format('YYYY-MM-DD HH:mm:ss');
    //     }

    //     // Test date and hour
    //     // transactionDate = '2024-04-17'
    //     // hour = 9
    //     const transactions = await Transaction.find({
    //       transactionDate: {
    //         $gte: new Date(`${transactionDate}T${hour}:00:00Z`),
    //         $lt: new Date(`${transactionDate}T${hour}:59:59Z`)
    //       },
    //       type: { $in: ['regular', 'void', 'refund', 'return'] }
    //     })
    //       .sort({ transaction_date: 1 });

    //     let sendFiles = false;
    //     let client = null;
    //     let filePathString = '';
    //     if (ayalaHost && ayalaUser && ayalaPassword) {
    //       sendFiles = true;
    //     }

    //     if (transactions?.length > 0) {
    //       // Check ayala collection if start and end txns were inserted on the previous hour
    //       let startTxn = 0;
    //       let lastTxn = 0;
    //       let ayalaTransaction;

    //       // Check first if txnNumbers are already created with respect to hour and txnDate
    //       ayalaTransaction = await Ayala.findOne({
    //         date: {
    //           $gte: new Date(`${transactionDate}T00:00:00Z`),
    //           $lte: new Date(`${transactionDate}T23:59:59Z`)
    //         },
    //         hour: hour
    //       });

    //       // If txnNumber does not exist yet, get the latest previous transaction
    //       if (!ayalaTransaction) {
    //         ayalaTransaction = await addAyalaTxn(transactionDate, hour, transactions.length);
    //       }

    //       // Get latest transaction if current transaction does not exist
    //       startTxn = ayalaTransaction.start;

    //       let rows = [
    //         CCCODE,
    //         storeName,
    //         moment(transactionDate).format('YYYY-MM-DD'),
    //         transactions?.length ?? 0
    //       ];

    //       let headerRows = ['CCCODE', 'MERCHANT_NAME', 'TRN_DATE', 'NO_TRN'];

    //       for (const [index, transaction] of transactions.entries()) {
    //         const row = await getTransactionRow(transaction, settings, startTxn);

    //         const hourValues = [
    //           row.CURRENT_DATE,
    //           row.TRANSACTION_TIME,
    //           parseInt(row.TERMINAL_NUMBER).toString().padStart(3, '0'),
    //           row.TRANSACTION_NUMBER,
    //           parseFloat(row.GROSS_SALES).toFixed(2),
    //           parseFloat(row.TOTAL_VAT_AMOUNT).toFixed(2),
    //           parseFloat(row.TOTAL_VATABLE_SALES).toFixed(2),
    //           parseFloat(row.TOTAL_NON_VAT).toFixed(2),
    //           parseFloat(row.TOTAL_VAT_EXEMPT).toFixed(2),
    //           parseFloat(row.TOTAL_VAT_EXEMPT_PWDSCD).toFixed(2),
    //           parseFloat(row.LOCAL_TAX).toFixed(2),
    //           parseFloat(row.PWD_DISCOUNTS).toFixed(2),
    //           parseFloat(row.SENIOR_CITIZEN_DISCOUNTS).toFixed(2),
    //           parseFloat(row.EMPLOYEE_DISCOUNTS).toFixed(2),
    //           parseFloat(row.AYALA_DISCOUNTS).toFixed(2),
    //           parseFloat(row.STORE_DISCOUNTS).toFixed(2),
    //           parseFloat(row.OTHER_DISCOUNTS).toFixed(2),
    //           parseFloat(row.TOTAL_REFUNDS).toFixed(2),
    //           parseFloat(row.SURCHARGE).toFixed(2),
    //           parseFloat(row.OTHER_SURCHARGE).toFixed(2),
    //           parseFloat(row.CASH_SALES).toFixed(2),
    //           parseFloat(row.CARD_SALES).toFixed(2),
    //           parseFloat(row.EPAY_SALES).toFixed(2),
    //           parseFloat(row.DEBIT_SALES).toFixed(2),
    //           parseFloat(row.OTHER_SALES).toFixed(2),
    //           parseFloat(row.CHECK_SALES).toFixed(2),
    //           parseFloat(row.GC_SALES).toFixed(2),
    //           parseFloat(row.MASTERCARD_SALES).toFixed(2),
    //           parseFloat(row.VISA_SALES).toFixed(2),
    //           parseFloat(row.AMEX_SALES).toFixed(2),
    //           parseFloat(row.DINERS_SALES).toFixed(2),
    //           parseFloat(row.JCB_SALES).toFixed(2),
    //           parseFloat(row.GCASH_SALES).toFixed(2),
    //           parseFloat(row.MAYA_SALES).toFixed(2),
    //           parseFloat(row.ALIPAY_SALES).toFixed(2),
    //           parseFloat(row.WECHAT_SALES).toFixed(2),
    //           parseFloat(row.GRAB_SALES).toFixed(2),
    //           parseFloat(row.FOODPANDA_SALES).toFixed(2),
    //           parseFloat(row.MASTERDEBIT_SALES).toFixed(2),
    //           parseFloat(row.VISADEBIT_SALES).toFixed(2),
    //           parseFloat(row.PAYPAL_SALES).toFixed(2),
    //           parseFloat(row.ONLINE_SALES).toFixed(2),
    //           parseFloat(row.OPEN_SALES).toFixed(2),
    //           parseFloat(row.OPEN_SALES2).toFixed(2),
    //           parseFloat(row.OPEN_SALES3).toFixed(2),
    //           parseFloat(row.OPEN_SALES4).toFixed(2),
    //           parseFloat(row.OPEN_SALES5).toFixed(2),
    //           parseFloat(row.OPEN_SALES6).toFixed(2),
    //           parseFloat(row.OPEN_SALES7).toFixed(2),
    //           parseFloat(row.OPEN_SALES8).toFixed(2),
    //           parseFloat(row.OPEN_SALES9).toFixed(2),
    //           parseFloat(row.OPEN_SALES10).toFixed(2),
    //           parseFloat(row.OPEN_SALES11).toFixed(2),
    //           parseFloat(row.GIFT_VOUCHER_EXCESS).toFixed(2),
    //           row.MOBILE_NO,
    //           row.NO_CUSTOMER,
    //           row.TRANSACTION_TYPE,
    //           row.SALES_FLAG,
    //           row.VAT_PERCENTAGE,
    //           row.QTY_SOLD,
    //           ...row.ITEMS_VALUES
    //         ];

    //         rows.push(...hourValues);
    //         headerRows.push(...ayalaHourlySalesHeaders, ...row.ITEMS_HEADERS);

    //         if (index === transactions.length - 1) lastTxn = startTxn.toString().padStart(15, '0'); // For file naming
    //         startTxn += 1;
    //       }

    //       if (sendFiles) {
    //         // Send file to other terminal
    //         client = new SMB2({
    //           share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
    //           domain: `${ayalaDomain}`,
    //           username: `${ayalaUser}`,
    //           password: `${ayalaPassword}`,
    //           autoCloseTimeout: 3000
    //         });

    //         const filePath = ['AYALA', `${year}`, 'new requirements'];
    //         filePathString = filePath.join('\\');

    //         await checkExists(client, 'AYALA\\');

    //         let currentPath = '';
    //         for (let i = 0; i < filePath.length; i++) {
    //           try {
    //             await createDirectory(client, currentPath + `${filePath[i]}\\`);
    //           } catch (err) {
    //             console.log(`Error creating directory`);
    //           }

    //           currentPath = currentPath + `${filePath[i]}\\`;
    //         }
    //       }

    //       const workbook = new Excel.Workbook();
    //       const worksheet = workbook.addWorksheet('Daily Sales');

    //       worksheet.getColumn(1).width = 20;
    //       worksheet.getColumn(1).values = headerRows;
    //       worksheet.getColumn(1).alignment = { horizontal: 'left' };
    //       worksheet.getColumn(2).width = 20;
    //       worksheet.getColumn(2).values = rows;
    //       worksheet.getColumn(2).alignment = { horizontal: 'right' };

    //       const urlPath = path.join(
    //         documentsDir,
    //         'UMBRA_POS_REPORTS',
    //         'AYALA',
    //         `${year}`,
    //         'new requirements'
    //       );

    //       const fileName = `${companyCode}${moment(transactionDate).format(
    //         'MMDDYY'
    //       )}${terminalNumber.padStart(3, '0')}_${lastTxn}.csv`;
    //       !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
    //       await workbook.csv.writeFile(path.join(urlPath, fileName), {
    //         formatterOptions: {
    //           quote: false
    //         }
    //       });

    //       // Copy file to other terminal via FTP
    //       try {
    //         if (sendFiles) {
    //           const csvFile = fs.readFileSync(path.join(urlPath, fileName));
    //           await writeFile(client, `${filePathString}\\${fileName}`, csvFile);
    //         }
    //       } catch (err) {
    //         console.log(err);
    //       }

    //     }
    //   } catch (err) {
    //     console.log(err);
    //     if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
    //       console.log(`Cannot connect to other terminal`);
    //     else console.log(`Failed to send file to other terminal`);
    //   }
    // });

    res.status(200).json({ message: 'Successfully created job for sending hourly transactions.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError(err, req, 'Something went wrong on processing the files.');
    next(error);
  }
};

exports.resendHourlySalesFile = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const { companyCode, contractNumber, terminalNumber  } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { ayalaRootPath, ayalaDomain, ayalaHost, ayalaUser, ayalaPassword } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};

    const [year, ,] = transactionDate.split('-');

    const filePath = path.join(
      documentsDir,
      'UMBRA_POS_REPORTS',
      'AYALA',
      `${year}`,
      'new requirements'
    );

    !fs.existsSync && fs.mkdirSync(filePath, { recursive: true });
    const files = fs.readdirSync(filePath);
    const nameFormat = `${companyCode}${contractNumber}${moment(
      transactionDate
    ).format('MMDDYY')}${terminalNumber.padStart(3, '0')}`;
    const resendFiles = files.filter((file) => file.includes(nameFormat));

    if (resendFiles?.length === 0) {
      return res.status(200).json({ message: 'No hourly sales files to resend.' });
    }

    if (!(ayalaHost && ayalaUser && ayalaPassword)) {
      return res
        .status(200)
        .json({ message: 'Successfully saved hourly sales file in local folder.' });
    }

    // Send file to other terminal
    const client = new SMB2({
      share: `\\\\${ayalaHost}\\${ayalaRootPath}`,
      domain: `${ayalaDomain}`,
      username: `${ayalaUser}`,
      password: `${ayalaPassword}`,
      autoCloseTimeout: 3000
    });

    const remoteFilePath = ['AYALA', `${year}`, 'new requirements'];
    const filePathString = remoteFilePath.join('\\');

    await checkExists(client, 'AYALA\\');
    let currentPath = '';
    for (let i = 0; i < remoteFilePath.length; i++) {
      try {
        await createDirectory(client, currentPath + `${remoteFilePath[i]}\\`);
      } catch (err) {
        console.log(`Error creating directory`);
      }

      currentPath = currentPath + `${remoteFilePath[i]}\\`;
    }

    const existingFilesPromises = resendFiles.map((file) => {
      return checkExists(client, `${filePathString}\\${file}`);
    });
    const existingFiles = await Promise.all(existingFilesPromises);

    const resendPromises = resendFiles.map((file, index) => {
      if (existingFiles[index]) {
        console.log(`File exists in other terminal. `);
        return () => null;
      }
      const csvFile = fs.readFileSync(path.join(filePath, file));
      return writeFile(client, `${filePathString}\\${file}`, csvFile);
    });

    try {
      await Promise.all(resendPromises);
      client.close();
      res
        .status(200)
        .json({ message: 'Successfully resent hourly transactions files to other terminal.' });
    } catch (err) {
      client.close();
      throw err;
    }
  } catch (err) {
    if (err.code === 'ECANCELED' || err.code === 'ETIMEDOUT')
      return next(new HttpError('Cannot connect to other terminal. File sending failed'));
    next(new HttpError('Failed to resend files to other terminal.'));
  }
};

exports.regeneratePerTransactionFilesStacked = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const [year, ,] = transactionDate.split('-');
    const { contractNumber, companyCode, terminalNumber } =
      settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { storeName } = settings[SettingsCategoryEnum.CompanyInfo] ?? {};
    const COMPANY_CODE = companyCode;
    const CONTRACT_NUMBER = contractNumber;
    const CCCODE = COMPANY_CODE + CONTRACT_NUMBER;

    const hours = Array.from({ length: 24 }, (_, i) => i + 1);
    for (const hour of hours) {
      const transactions = await Transaction.aggregate([
        {
          $match: {
            transactionDate: {
              $gte: new Date(`${transactionDate}T${String(hour).padStart(2, '0')}:00:00Z`),
              $lte: new Date(`${transactionDate}T${String(hour).padStart(2, '0')}:59:59Z`)
            },
            type: { $in: ['regular', 'void', 'refund', 'return'] }
          }
        },
        {
          $sort: { transactionDate: 1 }
        }
      ]);

      let rows = [
        CCCODE,
        storeName,
        moment(transactionDate).format('YYYY-MM-DD'),
        transactions?.length ?? 0
      ];

      let headerRows = ['CCCODE', 'MERCHANT_NAME', 'TRN_DATE', 'NO_TRN'];

      let lastTxn = '';

      if (transactions.length > 0) {
        let startTxn = 0;
        let ayalaTransaction;
        ayalaTransaction = await Ayala.findOne({
          date: {
            $gte: new Date(`${transactionDate}T00:00:00Z`),
            $lte: new Date(`${transactionDate}T23:59:59Z`)
          },
          hour: hour
        });

        // If no ayala transaction numbers found, then insert to collection
        if (!ayalaTransaction) {
          ayalaTransaction = await addAyalaTxn(transactionDate, hour, transactions.length);
        }

        startTxn = ayalaTransaction.start;

        for (const [index, transaction] of transactions.entries()) {
          const row = await getTransactionRow(transaction, settings, startTxn);

          const hourValues = [
            row.CURRENT_DATE,
            row.TRANSACTION_TIME,
            parseInt(row.TERMINAL_NUMBER).toString().padStart(3, '0'),
            row.TRANSACTION_NUMBER,
            parseFloat(row.GROSS_SALES).toFixed(2),
            parseFloat(row.TOTAL_VAT_AMOUNT).toFixed(2),
            parseFloat(row.TOTAL_VATABLE_SALES).toFixed(2),
            parseFloat(row.TOTAL_NON_VAT).toFixed(2),
            parseFloat(row.TOTAL_VAT_EXEMPT).toFixed(2),
            parseFloat(row.TOTAL_VAT_EXEMPT_PWDSCD).toFixed(2),
            parseFloat(row.LOCAL_TAX).toFixed(2),
            parseFloat(row.PWD_DISCOUNTS).toFixed(2),
            parseFloat(row.SENIOR_CITIZEN_DISCOUNTS).toFixed(2),
            parseFloat(row.EMPLOYEE_DISCOUNTS).toFixed(2),
            parseFloat(row.AYALA_DISCOUNTS).toFixed(2),
            parseFloat(row.STORE_DISCOUNTS).toFixed(2),
            parseFloat(row.OTHER_DISCOUNTS).toFixed(2),
            parseFloat(row.TOTAL_REFUNDS).toFixed(2),
            parseFloat(row.SURCHARGE).toFixed(2),
            parseFloat(row.OTHER_SURCHARGE).toFixed(2),
            parseFloat(row.CASH_SALES).toFixed(2),
            parseFloat(row.CARD_SALES).toFixed(2),
            parseFloat(row.EPAY_SALES).toFixed(2),
            parseFloat(row.DEBIT_SALES).toFixed(2),
            parseFloat(row.OTHER_SALES).toFixed(2),
            parseFloat(row.CHECK_SALES).toFixed(2),
            parseFloat(row.GC_SALES).toFixed(2),
            parseFloat(row.MASTERCARD_SALES).toFixed(2),
            parseFloat(row.VISA_SALES).toFixed(2),
            parseFloat(row.AMEX_SALES).toFixed(2),
            parseFloat(row.DINERS_SALES).toFixed(2),
            parseFloat(row.JCB_SALES).toFixed(2),
            parseFloat(row.GCASH_SALES).toFixed(2),
            parseFloat(row.MAYA_SALES).toFixed(2),
            parseFloat(row.ALIPAY_SALES).toFixed(2),
            parseFloat(row.WECHAT_SALES).toFixed(2),
            parseFloat(row.GRAB_SALES).toFixed(2),
            parseFloat(row.FOODPANDA_SALES).toFixed(2),
            parseFloat(row.MASTERDEBIT_SALES).toFixed(2),
            parseFloat(row.VISADEBIT_SALES).toFixed(2),
            parseFloat(row.PAYPAL_SALES).toFixed(2),
            parseFloat(row.ONLINE_SALES).toFixed(2),
            parseFloat(row.OPEN_SALES).toFixed(2),
            parseFloat(row.OPEN_SALES2).toFixed(2),
            parseFloat(row.OPEN_SALES3).toFixed(2),
            parseFloat(row.OPEN_SALES4).toFixed(2),
            parseFloat(row.OPEN_SALES5).toFixed(2),
            parseFloat(row.OPEN_SALES6).toFixed(2),
            parseFloat(row.OPEN_SALES7).toFixed(2),
            parseFloat(row.OPEN_SALES8).toFixed(2),
            parseFloat(row.OPEN_SALES9).toFixed(2),
            parseFloat(row.OPEN_SALES10).toFixed(2),
            parseFloat(row.OPEN_SALES11).toFixed(2),
            parseFloat(row.GIFT_VOUCHER_EXCESS).toFixed(2),
            row.MOBILE_NO,
            row.NO_CUSTOMER,
            row.TRANSACTION_TYPE,
            row.SALES_FLAG,
            row.VAT_PERCENTAGE,
            row.QTY_SOLD,
            ...row.ITEMS_VALUES
          ];

          rows.push(...hourValues);
          headerRows.push(...ayalaHourlySalesHeaders, ...row.ITEMS_HEADERS);

          if (index === transactions.length - 1) {
            lastTxn = startTxn.toString().padStart(15, '0');
          }
          startTxn += 1;
        }

        const workbook = new Excel.Workbook();
        const worksheet = workbook.addWorksheet('Daily Sales');
        worksheet.getColumn(1).width = 20;
        worksheet.getColumn(1).values = headerRows;
        worksheet.getColumn(1).alignment = { horizontal: 'left' };
        worksheet.getColumn(2).width = 20;
        worksheet.getColumn(2).values = rows;
        worksheet.getColumn(2).alignment = { horizontal: 'right' };

        const urlPath = path.join(
          documentsDir,
          'UMBRA_POS_REPORTS',
          'AYALA',
          `${year}`,
          'new requirements'
        );

        const fileName = `${CCCODE}${moment(transactionDate).format(
          'MMDDYY'
        )}${terminalNumber.padStart(3, '0')}_${lastTxn}.csv`;
        !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });
        await workbook.csv.writeFile(path.join(urlPath, fileName), {
          formatterOptions: {
            quote: false
          }
        });
      }
    }

    return res.status(200).json({ message: 'Test' });
  } catch (err) {
    console.log('err');
    return res.send(err.message);
  }
};

exports.getTransactionNumbers = async (req, res, next) => {
  try {

    await Ayala.deleteMany({});

    const txns = await Transaction.aggregate([
      {
        $match: {
          type: { $in: ['regular', 'void', 'refund', 'return'] }
        }
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$transactionDate' } },
            hour: { $hour: '$transactionDate' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          date: '$_id.date',
          hour: '$_id.hour',
          count: 1
        }
      }
    ]);

    

    let startingTxnNumber = 1;
    let endingTxnNumber = 0;
    const txnNumbers = [];
    txns.forEach((txn) => {
      const [currentDate, currentTime] = moment(txn.date)
        .hour(txn.hour)
        .format('YYYY-MM-DD HH:mm:ss')
        .split(' ');
      endingTxnNumber = endingTxnNumber + txn.count;
      txnNumbers.push({
        date: new Date(`${currentDate}T${currentTime}Z`),
        hour: txn.hour,
        start: startingTxnNumber,
        end: endingTxnNumber
      });

      startingTxnNumber += txn.count;
    });

    await Ayala.insertMany(txnNumbers);

    return res.status(200).json({ message: '' });
  } catch (err) {
    const error = new HttpError(
      err,
      req,
      'Something went wrong on generating ayala txnNumbers. ',
      500
    );
    return next(error);
  }
};

async function getTransactionRow(transaction, settings, txnNumber) {
  try {
    const itemsHeader = [];
    const itemsValues = [];
    let transactionNumber = '';

    const totalPayments = {
      cash: { count: 0, total: 0 },
      credit: { count: 0, total: 0 },
      debit: { count: 0, total: 0 },
      gcash: { count: 0, total: 0 },
      paymaya: { count: 0, total: 0 },
      giftCard: { count: 0, total: 0 },
      others: { count: 0, total: 0 }
    };

    const totalDiscounts = {
      scd: { count: 0, total: 0 },
      pwd: { count: 0, total: 0 },
      vat: { count: 0, total: 0 },
      employee: { count: 0, total: 0 },
      scdpwdpckg: { count: 0, total: 0 },
      pnstmd: { count: 0, total: 0 },
      others: { count: 0, total: 0 }
    };
    // console.log('transaction ', transaction);

    const nonSalesStatuses = ['void', 'refund', 'return'];
    // Get original transaction if type is void, return, or refund
    if (nonSalesStatuses.includes(transaction.type)) {
      const voidedRefunded = await Preview.findOne({
        type: transaction.type,
        txnNumber: transaction.txnNumber
      });

      const origSiNumber =
        transaction.type === 'void'
          ? voidedRefunded.data.cart.siNumber
          : voidedRefunded.data.cart.siNumber.split('-')[0];

      const txnNumber = await Transaction.findOne({
        siNumber: origSiNumber
      });

      transactionNumber = txnNumber.txnNumber;
    } else {
      transactionNumber = transaction.txnNumber;
    }

    const payments = await PaymentLog.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $group: {
          _id: '$method',
          total: { $sum: '$amount' },
          totalExcess: { $sum: { $add: ['$excessCash', '$excessGiftCardAmount'] } },
          count: { $sum: 1 },
          method: { $first: '$method' },
          type: { $first: '$type' }
        }
      }
    ]);

    const discounts = await DiscountLog.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $group: {
          _id: '$discount',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          discount: { $first: '$discount' }
        }
      }
    ]);

    const excessCashGc = await PaymentLog.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $group: {
          _id: null,
          totalExcess: { $sum: '$excessCash' }
        }
      }
    ]);

    const vatAmounts = await TransactionAmount.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $group: {
          _id: null,
          totalVatableSales: { $sum: '$vatableSale' },
          totalVatAmount: { $sum: '$vatAmount' },
          totalVatExempt: { $sum: '$vatExempt' },
          totalVatZeroRated: { $sum: '$vatZeroRated' },
          totalNonVat: { $sum: '$nonVat' }
        }
      }
    ]);

    const txnAmount = await Transaction.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $project: {
          amount: 1
        }
      }
    ]);

    const items = await Order.aggregate([
      {
        $match: {
          txnNumber: transactionNumber
        }
      },
      {
        $unwind: '$products'
      },
      {
        $project: {
          itemCode: '$products.productCode',
          quantity: '$products.quantity',
          grossPrice: '$products.origPrice',
          totalDiscount: {
            $sum: '$products.discounts.amount'
          }
        }
      }
    ]);

    let totalItems = 0;
    items.forEach((item) => {
      console.log('item ', item);
      itemsHeader.push(...['QTY', 'ITEMCODE', 'PRICE', 'LDISC']);
      itemsValues.push(
        ...[
          parseFloat(item.quantity).toFixed(3),
          item.itemCode,
          parseFloat(item.grossPrice).toFixed(2),
          parseFloat(item.totalDiscount).toFixed(2)
        ]
      );
      totalItems += Number(item.quantity);
    });

    // Summarize each data of payments to only one object
    let totalPayment = Number(txnAmount[0].amount);
    payments.forEach((payment) => {
      if (payment.method === 'Cash') {
        totalPayments.cash.count += payment.count;
        totalPayments.cash.total += payment.total < totalPayment ? payment.total : totalPayment;
      } else if (payment.method === 'Card (Mastercard)') {
        totalPayments.credit.count += payment.count;
        totalPayments.credit.total += payment.total < totalPayment ? payment.total : totalPayment;
      } else if (payment.method === 'Card (EPS)') {
        totalPayments.debit.count += payment.count;
        totalPayments.debit.total += payment.total < totalPayment ? payment.total : totalPayment;
      } else if (payment.method === 'GCash') {
        totalPayments.gcash.count += payment.count;
        totalPayments.gcash.total += payment.total < totalPayment ? payment.total : totalPayment;
      } else if (payment.method === 'Maya') {
        totalPayments.paymaya.count += payment.count;
        totalPayments.paymaya.total += payment.total < totalPayment ? payment.total : totalPayment;
      } else if (payment.type !== '') {
        // For gift cards
        totalPayments.giftCard.count += payment.count;
        totalPayments.giftCard.total +=
          payment.total < totalPayment
            ? payment.total - (payment.totalExcess ?? 0)
            : totalPayment - (payment.totalExcess ?? 0);
      } else {
        totalPayments.others.count += payment.count;
        totalPayments.others.total += payment.total < totalPayment ? payment.total : totalPayment;
      }

      totalPayment -= payment.total;
    });

    // Summarize each data of discounts to only one object
    discounts?.forEach((discount) => {
      if (
        discount.discount === 'VAT' ||
        discount.discount === 'DPLMTS' ||
        discount.discount === 'VATZR' ||
        discount.discount === 'VATEX'
      ) {
        totalDiscounts.vat.count += discount.count;
        totalDiscounts.vat.total += discount.total;
      } else if (discount.discount === 'SCD') {
        totalDiscounts.scd.count += discount.count;
        totalDiscounts.scd.total += discount.total;
      } else if (discount.discount === 'PWD') {
        totalDiscounts.pwd.count += discount.count;
        totalDiscounts.pwd.total += discount.total;
      } else if (discount.discount === 'PWDPCKG' || discount.discount === 'SCDPCKG') {
        totalDiscounts.scdpwdpckg.count += discount.count;
        totalDiscounts.scdpwdpckg.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else if (discount.discount === 'PNSTMD') {
        totalDiscounts.pnstmd.count += discount.count;
        totalDiscounts.pnstmd.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else if (discount.discount === 'Employee') {
        totalDiscounts.employee.count += discount.count;
        totalDiscounts.employee.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else {
        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      }
    });

    // Summarize each data of discounts to only one object
    discounts?.forEach((discount) => {
      if (
        discount.discount === 'VAT' ||
        discount.discount === 'DPLMTS' ||
        discount.discount === 'VATZR' ||
        discount.discount === 'VATEX'
      ) {
        totalDiscounts.vat.count += discount.count;
        totalDiscounts.vat.total += discount.total;
      } else if (discount.discount === 'SCD') {
        totalDiscounts.scd.count += discount.count;
        totalDiscounts.scd.total += discount.total;
      } else if (discount.discount === 'PWD') {
        totalDiscounts.pwd.count += discount.count;
        totalDiscounts.pwd.total += discount.total;
      } else if (discount.discount === 'PWDPCKG' || discount.discount === 'SCDPCKG') {
        totalDiscounts.scdpwdpckg.count += discount.count;
        totalDiscounts.scdpwdpckg.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else if (discount.discount === 'PNSTMD') {
        totalDiscounts.pnstmd.count += discount.count;
        totalDiscounts.pnstmd.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else if (discount.discount === 'Employee') {
        totalDiscounts.employee.count += discount.count;
        totalDiscounts.employee.total += discount.total;

        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      } else {
        totalDiscounts.others.count += discount.count;
        totalDiscounts.others.total += discount.total;
      }
    });

    const totalSCDPWCDiscounts =
      totalDiscounts.scd.total +
      totalDiscounts.pwd.total +
      totalDiscounts.scdpwdpckg.total +
      totalDiscounts.pnstmd.total;
    const TOTAL_VAT_AMOUNT = Number(vatAmounts[0]?.totalVatAmount ?? 0);
    const TOTAL_VATABLE_SALES = Number(vatAmounts[0]?.totalVatableSales ?? 0);
    const TOTAL_NON_VAT = Number(vatAmounts[0]?.totalNonVat ?? 0);
    const TOTAL_VAT_EXEMPT =
      Number(vatAmounts[0]?.totalVatExempt ?? 0) +
      Number(vatAmounts[0]?.totalVatZeroRated ?? 0) -
      totalSCDPWCDiscounts;
    const TOTAL_VAT_EXEMPT_PWDSCD = totalDiscounts.vat.total;
    const PWD_DISCOUNTS = totalDiscounts.pwd.total;
    const SENIOR_CITIZEN_DISCOUNTS = totalDiscounts.scd.total;
    const EMPLOYEE_DISCOUNTS = totalDiscounts.employee.total;
    const OTHER_DISCOUNTS = totalDiscounts.others.total;
    const TOTAL_REFUNDS =
      transaction.type === 'void' || transaction.type === 'regular'
        ? 0
        : Number(txnAmount[0]?.amount);
    const CASH_SALES = totalPayments.cash.total;
    const CREDIT_SALES = totalPayments.credit.total;
    const DEBIT_SALES = totalPayments.debit.total;
    const GC_SALES = totalPayments.giftCard.total;
    const GCASH_SALES = totalPayments.gcash.total;
    const MAYA_SALES = totalPayments.paymaya.total;

    const hourlySalesObj = {
      CURRENT_DATE: moment().format('YYYY-MM-DD'),
      TRANSACTION_TIME: moment(transaction.transactionDate).format('HH:mm'),
      TERMINAL_NUMBER: settings[SettingsCategoryEnum.UnitConfig].terminalNumber,
      TRANSACTION_NUMBER: txnNumber.toString().padStart(15, '0'),
      TOTAL_VAT_AMOUNT: transaction.type === 'void' ? 0 : TOTAL_VAT_AMOUNT,
      TOTAL_VATABLE_SALES: transaction.type === 'void' ? 0 : TOTAL_VATABLE_SALES,
      TOTAL_NON_VAT: transaction.type === 'void' ? 0 : TOTAL_NON_VAT,
      TOTAL_VAT_EXEMPT: transaction.type === 'void' ? 0 : TOTAL_VAT_EXEMPT,
      TOTAL_VAT_EXEMPT_PWDSCD: transaction.type === 'void' ? 0 : TOTAL_VAT_EXEMPT_PWDSCD,
      LOCAL_TAX: 0,
      PWD_DISCOUNTS: transaction.type === 'void' ? 0 : PWD_DISCOUNTS,
      SENIOR_CITIZEN_DISCOUNTS: transaction.type === 'void' ? 0 : SENIOR_CITIZEN_DISCOUNTS,
      EMPLOYEE_DISCOUNTS: transaction.type === 'void' ? 0 : EMPLOYEE_DISCOUNTS,
      AYALA_DISCOUNTS: 0,
      STORE_DISCOUNTS: 0,
      OTHER_DISCOUNTS: transaction.type === 'void' ? 0 : OTHER_DISCOUNTS,
      TOTAL_REFUNDS: TOTAL_REFUNDS,
      SURCHARGE: 0,
      GROSS_SALES:
        transaction.type === 'void'
          ? 0
          : TOTAL_VAT_AMOUNT +
            TOTAL_VATABLE_SALES +
            TOTAL_NON_VAT +
            TOTAL_VAT_EXEMPT +
            TOTAL_VAT_EXEMPT_PWDSCD +
            PWD_DISCOUNTS +
            SENIOR_CITIZEN_DISCOUNTS +
            OTHER_DISCOUNTS +
            TOTAL_REFUNDS,
      OTHER_SURCHARGE: 0,
      CASH_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * CASH_SALES
          : CASH_SALES,
      CARD_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * CREDIT_SALES
          : CREDIT_SALES,
      EPAY_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * (GCASH_SALES + MAYA_SALES)
          : GCASH_SALES + MAYA_SALES,
      DEBIT_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * DEBIT_SALES
          : DEBIT_SALES,
      CHECK_SALES: 0,
      GC_SALES:
        transaction.type === 'void' ? 0 : transaction.type !== 'regular' ? -1 * GC_SALES : GC_SALES,
      MASTERCARD_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * CREDIT_SALES
          : CREDIT_SALES,
      VISA_SALES: 0,
      AMEX_SALES: 0,
      DINERS_SALES: 0,
      JCB_SALES: 0,
      GCASH_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * GCASH_SALES
          : GCASH_SALES,
      MAYA_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * MAYA_SALES
          : MAYA_SALES,
      ALIPAY_SALES: 0,
      WECHAT_SALES: 0,
      GRAB_SALES: 0,
      FOODPANDA_SALES: 0,
      MASTERDEBIT_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * DEBIT_SALES
          : DEBIT_SALES,
      VISADEBIT_SALES: 0,
      PAYPAL_SALES: 0,
      ONLINE_SALES: 0,
      OTHER_SALES:
        transaction.type === 'void'
          ? 0
          : transaction.type !== 'regular'
          ? -1 * totalPayments.others.total
          : totalPayments.others.total,
      OPEN_SALES: 0,
      OPEN_SALES2: 0,
      OPEN_SALES3: 0,
      OPEN_SALES4: 0,
      OPEN_SALES5: 0,
      OPEN_SALES6: 0,
      OPEN_SALES7: 0,
      OPEN_SALES8: 0,
      OPEN_SALES9: 0,
      OPEN_SALES10: 0,
      OPEN_SALES11: 0,
      GIFT_VOUCHER_EXCESS: excessCashGc?.totalExcess ?? 0,
      MOBILE_NO: 0,
      NO_CUSTOMER: 1,
      TRANSACTION_TYPE: 'D',
      SALES_FLAG: transaction.type === 'regular' ? 'S' : 'R',
      VAT_PERCENTAGE: 1.12,
      QTY_SOLD: parseFloat(totalItems).toFixed(3),
      ITEMS_HEADERS: itemsHeader,
      ITEMS_VALUES: itemsValues
    };

    return hourlySalesObj;
  } catch (err) {
    console.log(err);
    throw err;
  }
}

async function addAyalaTxn(transactionDate, hour, count) {
  let startTxn = 1;
  let endTxn = 0;
  const [currentDate, currentTime] = moment(transactionDate)
    .hour(hour)
    .format('YYYY-MM-DD HH:mm:ss')
    .split(' ');

  // Check if for the latest previous ayala transactions
  const prevTransaction = await Ayala.findOne(
    {
      date: {
        $lt: new Date(`${currentDate}T${currentTime}Z`)
      }
    },
    {},
    { sort: { date: -1 } }
  );

  let newAyalaTxn = {
    date: new Date(`${currentDate}T${currentTime}Z`),
    hour: hour,
    start: startTxn,
    end: endTxn
  };

  if (prevTransaction) {
    newAyalaTxn.start = prevTransaction.end + 1;
    newAyalaTxn.end = newAyalaTxn.start + (count - 1);
  } else {
    newAyalaTxn.start = 1;
    newAyalaTxn.end = newAyalaTxn.start + (count - 1);
  }

  await Ayala.create(newAyalaTxn);
  // Insert to ayalaTxn collection

  return newAyalaTxn;
}

const currencyFormat = (num) => {
  return Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    useGrouping: false
  }).format(num);
};

const roundUpAmount = (num) => {
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};
