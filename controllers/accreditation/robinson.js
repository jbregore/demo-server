// const internetAvailable = require('internet-available');
const write = require('write');
// const Client = require('ftp');
// const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

const moment = require('moment');
const EventEmitter = require('node:events');
const Client = require('ssh2-sftp-client');
const HttpError = require('../../middleware/http-error');
const Preview = require('../../models/Preview');
const RobinsonFileLogs = require('../../models/RobinsonFileLogs');
const RobinsonLogs = require('../../models/RobinsonLogs');
const { SettingsCategoryEnum } = require('../common/settingsData');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

const dbChangesEmitter = new EventEmitter();
const pids = [];

exports.getDailySalesData = async (req, res, next) => {
  const { transactionDate, storeCode } = req.params;
  const { tenantId, terminalNumber } = req.query;

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

  // grab the number of EOD
  let eodCounter;
  try {
    eodCounter = await Preview.find({
      storeCode,
      type: 'z-read'
    }).maxTimeMS(300000);
  } catch (err) {
    const error = new HttpError(
      'Something went wrong while grabbing the batch number of EOD, please try again.',
      500
    );
    return next(error);
  }

  // grab robinson logs
  let robinsonLogs;
  try {
    robinsonLogs = await RobinsonLogs.findOne({
      storeCode,
      transactionDate: moment(transactionDate).format('YYYY-MM-DD')
    });
  } catch (err) {
    const error = new HttpError('Something went wrong while grabbing logs, please try again.', 500);
    return next(error);
  }

  const { batchNumber, reprint } = robinsonLogs;

  const terminalNumberFormat = terminalNumber > 9 ? terminalNumber : 0 + terminalNumber;

  const fileNameFormat = `${tenantId.slice(-4)}${moment(transactionDate).format(
    'MMDD'
  )}.${terminalNumberFormat}${batchNumber}`;

  const { zReadData } = validDate[0].data;

  const getReprintAmount = roundUpAmount(sum(reprint, 'amount'));

  const TOTAL_GROSS_SALES =
    zReadData.SALES.gross !== zReadData.SALES.net
      ? roundUpAmount(zReadData.SALES.gross)
      : roundUpAmount(zReadData.SALES.gross + zReadData.discounts.summary.total);
  const TOTAL_VOID_AMOUNT = roundUpAmount(zReadData.cashierAudit.VOID_TXN_AMOUNT);
  const TOTAL_VOID_COUNT = zReadData.cashierAudit.NUM_VOID_TXN;
  const TOTAL_DISCOUNT_AMOUNT = roundUpAmount(zReadData.discounts.summary.total);
  const TOTAL_DISCOUNT_COUNT = zReadData.discounts.summary.count;
  const TOTAL_REFUND_AMOUNT = roundUpAmount(zReadData.cashierAudit.REFUND_TXN_AMOUNT);
  const TOTAL_REFUND_COUNT = zReadData.cashierAudit.NUM_REFUND_TXN;
  const GRAND_BEGINNING = roundUpAmount(zReadData.ACCUMULATED_SALES.old);
  const GRAND_ENDING = roundUpAmount(zReadData.ACCUMULATED_SALES.new);
  const TOTAL_CREDIT_SALES = roundUpAmount(zReadData.payments.nonCash.cards.CREDIT_CARD.total);
  const TOTAL_CREDIT_VAT = roundUpAmount(Math.abs(TOTAL_CREDIT_SALES / 1.12 - TOTAL_CREDIT_SALES));
  const TOAL_NON_VATABLE = roundUpAmount(zReadData.vat.VAT_DETAILS.nonVatable);
  const TOTAL_PWD_DISCOUNT = roundUpAmount(
    zReadData.discounts.DISCOUNT_ITEMS.find((x) => x.discount === 'PWD')?.total || 0
  );
  const TOTAL_SC_DISCOUNT = roundUpAmount(
    zReadData.discounts.DISCOUNT_ITEMS.find((x) => x.discount === 'SCD')?.total || 0
  );
  const TOTAL_SALES_RENT = roundUpAmount(
    zReadData.department.CATEGORIES.find((x) => ['GIFT CARD'].includes(x.material))?.totalAmount || 0
  );
  const CALC_TAX_VAT =
    Number(TOTAL_GROSS_SALES) -
    (Number(TOTAL_SC_DISCOUNT) +
      Number(TOAL_NON_VATABLE) +
      Number(TOTAL_PWD_DISCOUNT) +
      Number(TOTAL_SALES_RENT));
  const TOTAL_TAX_VAT = roundUpAmount((CALC_TAX_VAT / 1.12) * 0.12);

  const dailySalesObj = {
    tenantCode: '01' + dataFormat(tenantId),
    terminalNumber: '02' + dataFormat(terminalNumber),
    totalGrossSales: '03' + dataFormat(TOTAL_GROSS_SALES.toString()),
    totalTaxVat: '04' + dataFormat(TOTAL_TAX_VAT.toString()),
    totalVoidAmount: '05' + dataFormat(TOTAL_VOID_AMOUNT.toString()),
    totalVoidCount: '06' + dataFormat(TOTAL_VOID_COUNT.toString()),
    totalDiscountAmount: '07' + dataFormat(TOTAL_DISCOUNT_AMOUNT.toString()),
    totalDiscountCount: '08' + dataFormat(TOTAL_DISCOUNT_COUNT.toString()),
    totalReturnAmount: '09' + dataFormat(TOTAL_REFUND_AMOUNT.toString()),
    totalReturnCount: '10' + dataFormat(TOTAL_REFUND_COUNT.toString()),
    otherNegativeAdj: '11' + dataFormat(TOTAL_SC_DISCOUNT.toString()),
    totalNegativeAdjCount: '120000000000000000',
    totalServiceCharge: '13' + dataFormat('0.00'),
    prevEODCounter:
      '14' + dataFormat(eodCounter.length === 1 ? '0' : (eodCounter.length - 1).toString()),
    prevAccuGrandTotal: '15' + dataFormat(GRAND_BEGINNING.toString()),
    currentEODCounter: '16' + dataFormat(eodCounter.length.toString()),
    currentAccuGrandTotal: '17' + dataFormat(GRAND_ENDING.toString()),
    salesTransactionDate: '18' + dataFormat(moment(new Date(transactionDate)).format('MM/DD/YYYY')),
    promotionalItems: '190000000000000.00',
    misc: '200000000000000.00',
    localTax: '210000000000000.00',
    totalCreditSales: '22' + dataFormat(TOTAL_CREDIT_SALES.toString()),
    totalCreditTaxVat: '23' + dataFormat(TOTAL_CREDIT_VAT.toString()),
    totalNonVatSales: '24' + dataFormat(TOAL_NON_VATABLE.toString()),
    totalPharmaSales: '250000000000000.00',
    totalNonPharmaSales: '260000000000000.00',
    totalPWDAmount: '27' + dataFormat(TOTAL_PWD_DISCOUNT.toString()),
    grossSalesRent: '28' + dataFormat(TOTAL_SALES_RENT.toString()),
    totalReprintAmount: '29' + dataFormat(getReprintAmount.toString()),
    totalReprintCount: '30' + dataFormat(reprint.length.toString())
  };

  const dailySalesData = Object.values(dailySalesObj).join('\n');

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/ROBINSON`;
  !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

  write.sync(`${urlPath}/${fileNameFormat}.txt`, '\ufeff' + dailySalesData, {
    overwrite: true
  });

  try {
    await RobinsonLogs.findOneAndUpdate(
      {
        storeCode,
        transactionDate: moment(transactionDate).format('YYYY-MM-DD')
      },
      { $set: { batchNumber: batchNumber + 1 } }
    );
  } catch (err) {
    console.log(err)
  }

  return res.status(200).json({ message: 'Success', file: fileNameFormat });
};

exports.sendRobinsonsFile = async (req, res, next) => {
  const { file, settings, transactionDate } = req.body;
  const { robinsonsFTPHost, robinsonsFTPUsername, robinsonsFTPPassword, robinsonsFTPRootPath } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
  const { storeCode } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

  const filePath = path.join(
    documentsDir,
    'UMBRA_POS_REPORTS',
    'ROBINSON',
    `${file}.txt`
  );

  try {
    const fileExists = fs.existsSync(filePath);
    if (!fileExists) {
      const error = new HttpError('Robinsons File not found.');
      next(error);
    }

    const c = new Client();
    await c.connect({
      host: robinsonsFTPHost,
      username: robinsonsFTPUsername,
      password: robinsonsFTPPassword,
      port: 22,
      readyTimeout: 50000,
      debug: console.log,
      algorithms: {
        kex: [
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha1"
        ],
        cipher: [
          "3des-cbc",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes128-gcm@openssh.com",
          "aes256-gcm",
          "aes256-gcm@openssh.com"
        ],
        serverHostKey: [
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521"
        ],
        hmac: [
          "hmac-sha2-256",
          "hmac-sha2-512",
          "hmac-sha1"
        ]
      },
      retries: 1,
      retry_minTimeout: 1000
    });

    await c.put(
      filePath,
      `${robinsonsFTPRootPath ? '/' + robinsonsFTPRootPath : ''}/${file}`
    );

    // Update batch number after successful sending
    await RobinsonLogs.findOne(
      {
        storeCode: storeCode,
        transactionDate: moment(transactionDate).format('YYYY-MM-DD')
      }
    );

    // Add file log
    await RobinsonFileLogs.create({
      fileName: `${file}.txt`,
      sent: true,
      transactionDate: transactionDate,
      storeCode: `${storeCode}`
    });

    dbChangesEmitter.emit('insert');
    res.status(200).json({ message: 'Succesfully uploaded file to SFTP server.' });
  } catch (err) {
    await RobinsonFileLogs.create({
      fileName: `${file}.txt`,
      sent: false,
      transactionDate: transactionDate,
      storeCode: `${storeCode}`
    });

    dbChangesEmitter.emit('insert');
    const error = new HttpError('Something went wrong on sending the files to RLC server.');
    next(error);
  }
};

exports.resendRobinsonsFile = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const { robinsonsFTPHost, robinsonsFTPUsername, robinsonsFTPPassword, robinsonsFTPRootPath } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { tenantId, terminalNumber } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
    const { storeCode } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

    const robinsonLogs = await RobinsonLogs.findOne({
      storeCode: storeCode,
      transactionDate: moment(transactionDate).format('YYYY-MM-DD')
    });

    const { batchNumber } = robinsonLogs;
    let latestFileNumber = batchNumber;
    const terminalNumberFormat = terminalNumber > 9 ? terminalNumber : 0 + terminalNumber;
    while (latestFileNumber > 0) {
      const file = `${tenantId.slice(-4)}${moment(transactionDate).format(
        'MMDD'
      )}.${terminalNumberFormat}${latestFileNumber}`;
      const filePath = path.join(documentsDir, 'UMBRA_POS_REPORTS', 'ROBINSON', `${file}.txt`);
      const fileExists = fs.existsSync(filePath);
      if (fileExists) {
        break;
      }

      latestFileNumber = latestFileNumber - 1;
    }

    if (latestFileNumber === 0) {
      const error = new HttpError('No latest Robinsons report file generated yet.');
      return next(error);
    }

    const c = new Client();
    await c.connect({
      host: robinsonsFTPHost,
      username: robinsonsFTPUsername,
      password: robinsonsFTPPassword,
      port: 22,
      readyTimeout: 50000,
      debug: console.log,
      algorithms: {
        kex: [
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha1"
        ],
        cipher: [
          "3des-cbc",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes128-gcm@openssh.com",
          "aes256-gcm",
          "aes256-gcm@openssh.com"
        ],
        serverHostKey: [
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521"
        ],
        hmac: [
          "hmac-sha2-256",
          "hmac-sha2-512",
          "hmac-sha1"
        ]
      },
      retries: 1,
      retry_minTimeout: 1000
    });

    const existingFile = `${tenantId.slice(-4)}${moment(transactionDate).format('MMDD')}.${terminalNumberFormat}${latestFileNumber}`;
    const existingFilePath = path.join(documentsDir, 'UMBRA_POS_REPORTS', 'ROBINSON', `${existingFile}.txt`);
    await c.put(existingFilePath, `/${robinsonsFTPRootPath || 'IT_Tenants'}/${existingFile}.txt`);

    // Increment batch number
    if (latestFileNumber === batchNumber) {
      await RobinsonLogs.findOneAndUpdate(
        {
          storeCode: storeCode,
          transactionDate: moment(transactionDate).format('YYYY-MM-DD')
        },
        { $inc: { batchNumber: 1 } },
        { new: true }
      );
    }

    await RobinsonFileLogs.findOneAndUpdate({
      fileName: `${existingFile}.txt`
    }, { sent: true }, { new: true });

    res.json(200).status('Sales file successfully resent to RLC server');
  } catch (err) {
    console.log(err);
    const error = new HttpError('Error on sending file to  SFTP');
    next(error);
  }
};

exports.getSentFiles = async (req, res, next) => {
  try {
    const { transactionDate } = req.params;

    const sentFiles = await RobinsonFileLogs.find({
      sent: true,
      transactionDate: {
       $regex: transactionDate 
      }
    });

    console.log(`Sent files are `, sentFiles)

    res.status(200).json({ sentFiles });
  } catch (err) {
    const error = new HttpError('Something went wrong.');
    next(error);
  }
};

exports.resendExistingRLCFile = async (req, res, next) => {
  try {
    const { fileName, path, settings } = req.body;

    const { robinsonsFTPHost, robinsonsFTPUsername, robinsonsFTPPassword, robinsonsFTPRootPath } = settings[SettingsCategoryEnum.UnitConfig] ?? {};


    const c = new Client();
    await c.connect({
      host: robinsonsFTPHost,
      username: robinsonsFTPUsername,
      password: robinsonsFTPPassword,
      port: 22,
      readyTimeout: 99999,
      debug: console.log,
      algorithms: {
        kex: [
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha1"
        ],
        cipher: [
          "3des-cbc",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes128-gcm@openssh.com",
          "aes256-gcm",
          "aes256-gcm@openssh.com"
        ],
        serverHostKey: [
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521"
        ],
        hmac: [
          "hmac-sha2-256",
          "hmac-sha2-512",
          "hmac-sha1"
        ]
      }
    });

    await c.put(path, `${robinsonsFTPRootPath ? '/' + robinsonsFTPRootPath : ''}/${fileName}`);
    res.status(200).json({ message: 'Successfully resent file.' });
  } catch (err) {
    const error = new HttpError('Failed to resend file.');
    next(error);
  }
};

exports.sendBatchFiles = async (req, res, next) => {
  const { settings, files } = req.body;
  const { robinsonsFTPHost, robinsonsFTPUsername, robinsonsFTPPassword, robinsonsFTPRootPath } = settings[SettingsCategoryEnum.UnitConfig] ?? {};
  const { storeCode, } = settings[SettingsCategoryEnum.UnitConfig] ?? {};

  try {
    const c = new Client();
    await c.connect({
      host: robinsonsFTPHost,
      username: robinsonsFTPUsername,
      password: robinsonsFTPPassword,
      port: 22,
      readyTimeout: 10_000,
      debug: console.log,
      algorithms: {
        kex: [
          "diffie-hellman-group1-sha1",
          "ecdh-sha2-nistp256",
          "ecdh-sha2-nistp384",
          "ecdh-sha2-nistp521",
          "diffie-hellman-group-exchange-sha256",
          "diffie-hellman-group14-sha1"
        ],
        cipher: [
          "3des-cbc",
          "aes128-ctr",
          "aes192-ctr",
          "aes256-ctr",
          "aes128-gcm",
          "aes128-gcm@openssh.com",
          "aes256-gcm",
          "aes256-gcm@openssh.com"
        ],
        serverHostKey: [
          "ssh-rsa",
          "ecdsa-sha2-nistp256",
          "ecdsa-sha2-nistp384",
          "ecdsa-sha2-nistp521"
        ],
        hmac: [
          "hmac-sha2-256",
          "hmac-sha2-512",
          "hmac-sha1"
        ]
      },
      retries: 1,
      retry_minTimeout: 2_000
    });

    for (const file of files) {
      try {
        await c.put(path.join(documentsDir, 'UMBRA_POS_REPORTS', 'ROBINSON', `${file.file}.txt`), `${robinsonsFTPRootPath ? '/' + robinsonsFTPRootPath : ''}/${file.file}`);

        // Update batch number after successful sending
        await RobinsonLogs.findOneAndUpdate(
          {
            fileName: `${file.file}.txt`,
            storeCode: storeCode,
            transactionDate: moment(file.transactionDate).format('YYYY-MM-DD'),
          },
          { $inc: { batchNumber: 1 } },
          { new: true }
        );

        // Add file log
        await RobinsonFileLogs.create({
          fileName: `${file.file}.txt`,
          sent: true,
          transactionDate: file.transactionDate,
          storeCode: `${storeCode}`
        });
      } catch (err) {
        await RobinsonFileLogs.create({
          fileName: `${file.file}.txt`,
          sent: false,
          transactionDate: file.transactionDate,
          storeCode: `${storeCode}`
        });
      }
    }

    dbChangesEmitter.emit('insert', true);
    res.status(200).json({ message: 'Successfully sent RLC files.' });
  } catch (err) {
    for (const file of files) {
      await RobinsonFileLogs.create({
        fileName: `${file.file}.txt`,
        sent: false,
        transactionDate: file.transactionDate,
        storeCode: `${storeCode}`
      });
    }
    dbChangesEmitter.emit('insert', false);
    const error = new HttpError('Something went wrong on sending the files to RLC server.');
    next(error);
  }
};

exports.autoResendUnsentFiles = async (req, res, next) => {
  try {
    const data = req.query;
    dbChangesEmitter.removeAllListeners('insert');
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-cache",
      Connection: "keep-alive", // allowing TCP connection to remain open for multiple HTTP requests/responses
      "Content-Type": "text/event-stream", // media type for Server Sent Events (SSE)
    });

    data.docsPath = documentsDir;

    const spawnResenderProcess = () => {
      const resenderProcess = fork(path.join(__dirname, 'robinsonsResender.js'), {
        env: {
          MONGODB_URI_LOCAL: process.env.MONGODB_URI_LOCAL
        }
      });

      pids.push(resenderProcess.pid);
      resenderProcess.send(JSON.stringify(data));
      resenderProcess.on('message', (message) => {
        const result = JSON.parse(message);
        if (result.empty) {
          resenderProcess.kill();
        }
        if (result.resent && result.fullSent) {
          resenderProcess.kill();
          res.write(`data: ${JSON.stringify({ resent: true })}\n\n`);
        }
      });

      resenderProcess.on('exit', () => {
        console.log(`Resender Process exited`);
        pids.pop();
      });
    };

    dbChangesEmitter.on('insert', () => {
      if (pids.length === 0) {
        spawnResenderProcess();
      } else {
        console.log(`Resender process was already created.`);
      }
    });

    if (pids.length === 0) {
      spawnResenderProcess();
    } else {
      console.log(`Resender process was already created.`);
    }

    res.on('close', () => {
      console.log(`Connection is closed`);
      res.end();
    });

  } catch (err) {
    const error = new HttpError('Something went wrong on resending Robinsons files');
    next(error);
  }
};

const dataFormat = (replacementString) => {
  const originalString = '0000000000000000';
  const originalLength = originalString.length;
  const replacementLength = replacementString.length;

  if (replacementLength >= originalLength) {
    // If the replacement string is longer or equal to the original string,
    // simply return the replacement string since it will fully replace the original.
    return replacementString;
  }

  // Extract the substring from the original string starting from the beginning
  const extractedSubstring = originalString.substring(0, originalLength - replacementLength);

  // Concatenate the extracted substring with the replacement string
  const result = extractedSubstring + replacementString;

  return result;
};

const sum = (array, key) => {
  return array.reduce((a, b) => Number(a) + (Number(b[key]) || 0), 0);
};

const roundUpAmount = (num) => {
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};
