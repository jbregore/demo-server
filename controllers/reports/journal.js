const Preview = require('../../models/Preview');
const HttpError = require('../../middleware/http-error');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const { SettingsCategoryEnum } = require('../common/settingsData');
const path = require('path');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.getTransactions = async (req, res, next) => {
  const { transactionDate, storeCode } = req.params; 
  let transactions;

  try {
    transactions = await Preview.find({
      transactionDate: {
        $gte: new Date(`${transactionDate}T00:00:00Z`),
        $lte: new Date(`${transactionDate}T23:59:59Z`)
      },
      storeCode: storeCode
    })
      .sort({ createdAt: 1 })
      .maxTimeMS(300000);
  } catch (err) {
    const error = new HttpError('Failed to fetch transactions, please try again.', 500);
    return next(error);
  }
  res.status(200).json({ data: transactions });
};

exports.uploadJournal = async (req, res, next) => {
  try {
    const { transactions, settings } = req.body;

    let journalContent = '';
    transactions.forEach(({ data, type }) => {
      const { cart, cashier, xReadData, zReadData, cashReport, total } = data;

      if (type === 'initial cash') {
        journalContent += printInitialCash(cashReport, total, settings);
      } else if (type === 'regular') {
        journalContent += printRegular(cart, cashier, settings);
      } else if (type === 'package') {
        journalContent += printPackage(data, cashier, settings);
      } else if (type === 'void') {
        journalContent += printVoid(cart, cashier, settings);
      } else if (type === 'refund') {
        journalContent += printRefund(cart, cashier, settings);
      } else if (type === 'return') {
        journalContent += printReturn(cart, cashier, settings);
      } else if (type === 'cash takeout') {
        journalContent += printCashTakeout(cashReport, total, settings);
      } else if (type === 'x-read') {
        journalContent += printXRead(xReadData, cashier, settings);
      } else if (type === 'z-read') {
        journalContent += printZRead(zReadData, cashier, settings);
      }
    });

    res.setHeader('Content-Disposition', 'attachment; filename="E-Journal.txt"');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    res.send('\ufeff' + journalContent);

  } catch (err) {
    console.error(err);
  }
};

exports.downloadJournal = async (req, res, next) => {
  const { transactionDate } = req.query;

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/E-JOURNAL`;

  await res.download(`${urlPath}/E-Journal.txt`, `E Journal - ${transactionDate}.txt`);
};

exports.downloadAccumulated = async (req, res, next) => {
  const { transactionDate } = req.query;

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/ACCUMULATED_SALES`;

  await res.download(
    `${urlPath}/Accumulated Sales-Backend Report.xlsx`,
    `Accumulated Sales-Backend Report - ${transactionDate}.xlsx`
  );
};

exports.downloadProductSales = async (req, res, next) => {
  const { from, to } = req.query;

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/PRODUCT_SALES`;

  await res.download(
    `${urlPath}/Product Sales Report.xlsx`,
    `Product Sales Report - ${from} : ${to}.xlsx`
  );
};

const printInitialCash = (cashReport, total, settings) => {
  try {
    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: false,
      lineCharacter: '-',
      width: '33px'
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

    epsonThermalPrinter.clear();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cashReport.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.println(
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber} PHP`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('I N I T I A L  C A S H');
    epsonThermalPrinter.newLine();

    // eslint-disable-next-line no-unused-vars
    for (const [key, value] of Object.entries(cash)) {
      if (value.value !== 0) {
        epsonThermalPrinter.println(`${value.label} x ${value.value}`);
      }
    }

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println(`Total      : ${fCurrency('', total.toFixed(2))}`);
    epsonThermalPrinter.newLine();

    epsonThermalPrinter.println(
      `Cashier    : ${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${cashReport.employeeId
      })`
    );
    epsonThermalPrinter.println(`Shift      : ${cashReport.shift}`);

    epsonThermalPrinter.println(
      `Date-time  : ${moment(cashReport.realTimeDate).format('MM/DD/YYYY - hh:mm A')}`
    );

    epsonThermalPrinter.println(`Txn No.    : ${cashReport.txnNumber}`);

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(
      `${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${cashReport.employeeId
      })`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('___________________________');
    epsonThermalPrinter.println("Cashier's Signature");

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('TURNED OVER BY');

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printPackage = (cart, cashier, settings) => {
  try {
    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: true,
      lineCharacter: '-',
      width: '33px'
    });

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      settings.unitConfiguration.nonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.println('SALES INVOICE');
    epsonThermalPrinter.newLine();

    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('Customer:');
    epsonThermalPrinter.println('Address:');
    epsonThermalPrinter.println('TIN:');
    epsonThermalPrinter.println('Business Style:');
    epsonThermalPrinter.println('OSCA ID/PED ID:');

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.leftRight(
      `STORE # ${cart.storeCode}`,
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );
    epsonThermalPrinter.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
    epsonThermalPrinter.println(`Txn No.: ${cart.txnNumber}`);
    epsonThermalPrinter.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

    epsonThermalPrinter.println(
      `Date-time: ${moment(cart.transactionDate).format('MM/DD/YYYY - hh:mm A')}`
    );

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.alignLeft();

    let totalNumItems = 0;

    epsonThermalPrinter.alignLeft();
    cart.confirmPackages.forEach((specsPagkage) => {
      totalNumItems += specsPagkage.quantity;

      epsonThermalPrinter.println(`${specsPagkage.productCode}  ${specsPagkage.productName}`);
      epsonThermalPrinter.leftRight(
        ` ${specsPagkage.quantity} ${specsPagkage.quantity > 1 ? 'PIECES' : 'PIECE'} @ ${fCurrency(
          '',
          specsPagkage.price.toFixed(2)
        )}`,
        `${fCurrency('', (specsPagkage.price * specsPagkage.quantity).toFixed(2))}T`
      );
      epsonThermalPrinter.println('   Lab Code  : 0');
    });

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(`   No. of Items: ${totalNumItems}`);
    epsonThermalPrinter.drawLine();

    let totalAmount = 0;
    cart.confirmPackages.forEach((specsPagkage) => {
      totalAmount += specsPagkage.price * specsPagkage.quantity;
    });

    epsonThermalPrinter.leftRight('   Total', fCurrency('', totalAmount.toFixed(2)));
    epsonThermalPrinter.leftRight('   Amount Due', fCurrency('', totalAmount.toFixed(2)));
    epsonThermalPrinter.leftRight('   CASH PESO', fCurrency('', totalAmount.toFixed(2)));
    epsonThermalPrinter.leftRight('   Change', '0.00');
    epsonThermalPrinter.newLine();

    epsonThermalPrinter.println(
      `Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('VATable Sale', fCurrency('', totalAmount.toFixed(2)));
    epsonThermalPrinter.leftRight(`VAT ${cart.vatPercentage}%`, '0.00');
    epsonThermalPrinter.leftRight('VAT Exempt', '0.00');
    epsonThermalPrinter.leftRight('VAT Zero Rated', '0.00');
    epsonThermalPrinter.leftRight('Non-VAT', '0.00');
    epsonThermalPrinter.alignRight();
    epsonThermalPrinter.println('----------');
    epsonThermalPrinter.leftRight('Total', fCurrency('', totalAmount.toFixed(2)));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Umbra Digital Company');
    epsonThermalPrinter.println(
      '930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines'
    );
    epsonThermalPrinter.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
    epsonThermalPrinter.println(
      `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued
      }`
    );
    epsonThermalPrinter.println(
      `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
      }`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('Thank you for shopping');
    epsonThermalPrinter.println(
      `Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printRegular = (cart, cashier, settings) => {
  try {
    const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: true,
      lineCharacter: '-',
      width: '33px'
    });

    const roundUpAmount = (num) => {
      // num = Math.round(num * 100) / 100;
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cart.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('SALES INVOICE');

    let isScPwd = false;
    let scPwdIdNumber = '';
    let type = '';

    cart.discounts
      .filter(
        (x) =>
          x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
      )
      .forEach((discount) => {
        isScPwd = true;
        scPwdIdNumber = discount.idNumber;
        type = discount.prefix;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter(
              (x) =>
                x.prefix === 'SCD' ||
                x.prefix === 'PWD' ||
                x.prefix === 'PNSTMD' ||
                (x.prefix === 'VAT' && x.prefix === 'PACKAGEDISCOUNT') ||
                x.prefix === 'VAT'
            )
            .forEach((discount) => {
              isScPwd = true;
              scPwdIdNumber = discount.idNumber;
              type = discount.prefix;
            });
        }
      });
    });

    let isVatZR = false;
    let vatZrRepresentative = '';
    let vatZrCert = '';

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        isVatZR = true;
        vatZrRepresentative = discount.idNumber;
        vatZrCert = discount.pecaCertNo;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'VATZR')
            .forEach((discount) => {
              isVatZR = true;
              vatZrRepresentative = discount.idNumber;
              vatZrCert = discount.pecaCertNo;
            });
        }
      });
    });

    epsonThermalPrinter.alignLeft();

    cart.confirmOrders.forEach((order) => {
      epsonThermalPrinter.newLine();

      if (isVatZR) {
        epsonThermalPrinter.println(
          `Customer: ${isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
          } `
        );
      } else if (isScPwd) {
        epsonThermalPrinter.println(
          `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
        );
      } else {
        const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
        epsonThermalPrinter.println(
          `Customer: ${notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
          }`
        );
      }

      epsonThermalPrinter.println('Address:');

      // if (order.discounts) {
      //   if (
      //     order.discounts.filter(
      //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
      //     ).length > 0
      //   ) {
      //     isScPwd = true;
      //   }
      // }

      if (isScPwd) {
        if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
          epsonThermalPrinter.println('SC/PWD TIN:');
        }

        epsonThermalPrinter.println(
          `${type === 'SCD' ||
            type === 'SCD-5%' ||
            type === 'PWD' ||
            (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
            type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
          } ${scPwdIdNumber}`
        );
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignCenter();
        epsonThermalPrinter.println('_______________________');
        epsonThermalPrinter.println('Signature');
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignLeft();
      } else {
        epsonThermalPrinter.println('TIN:');
        epsonThermalPrinter.println('Business Style:');
        epsonThermalPrinter.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

        if (isVatZR) {
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignCenter();
          epsonThermalPrinter.println('_______________________');
          epsonThermalPrinter.println('Signature');
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignLeft();
        }
      }

      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(
        `STORE # ${cart.branchCode}`,
        `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
      );
      epsonThermalPrinter.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
      epsonThermalPrinter.println(`Txn No.: ${cart.txnNumber}`);
      epsonThermalPrinter.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

      epsonThermalPrinter.println(
        `Date-time: ${moment(cart.cartDate).format('MM/DD/YYYY - hh:mm A')}`
      );

      epsonThermalPrinter.drawLine();
      epsonThermalPrinter.alignLeft();

      let totalNumItems = 0;
      order.products.forEach((specs) => {
        totalNumItems += Number(specs.quantity);

        epsonThermalPrinter.println(
          `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${specs.productName
          }`
        );
        epsonThermalPrinter.leftRight(
          ` ${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
          `${fCurrency(
            '',
            specs.overridedPrice
              ? roundUpAmount(specs.overridedPrice)
              : roundUpAmount(specs.price * Number(specs.quantity))
          )}`
        );
        if (specs.discounts) {
          specs.discounts.forEach((discount) => {
            epsonThermalPrinter.leftRight(
              `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }

        // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);

        if (specs.upgrades) {
          totalNumItems += specs.upgrades.quantity;

          epsonThermalPrinter.println(
            `${specs.upgrades.productCode} ${specs.upgrades.productName}`
          );
          epsonThermalPrinter.leftRight(
            ` 1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
            `${fCurrency('', roundUpAmount(specs.upgrades.price))}`
          );
          if (specs.upgrades.discounts) {
            specs.upgrades.discounts.forEach((discount) => {
              epsonThermalPrinter.leftRight(
                `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
                }`,
                `${fCurrency('-', roundUpAmount(discount.amount))}`
              );
            });
          }
          // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);
        }
      });
      if (order.discounts) {
        epsonThermalPrinter.newLine();
        order.discounts.forEach((discount) => {
          epsonThermalPrinter.leftRight(
            `   LESS (${discount.prefix})`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(`   No. of Items: ${totalNumItems}`, '');
      epsonThermalPrinter.drawLine();
    });
    epsonThermalPrinter.leftRight('   Total', fCurrency('', roundUpAmount(cart.amounts.subtotal)));

    cart.discounts
      .filter((x) => x.prefix !== 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
          }`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });

    cart.discounts
      .filter((x) => x.prefix === 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          '   POINTS REDEEM',
          fCurrency('', roundUpAmount(discount.amount))
        );
      });

    epsonThermalPrinter.leftRight(
      '   Amount Due',
      fCurrency('', fCurrency('', fCurrency('', roundUpAmount(cart.amounts.noPayment))))
    );

    cart.payments.forEach((payment) => {
      if (payment.value === 'cash') {
        epsonThermalPrinter.leftRight('   CASH PESO', fCurrency('', roundUpAmount(payment.amount)));
      } else if (payment.value === 'rmes') {
        epsonThermalPrinter.leftRight('   EXCHANGE', fCurrency('', roundUpAmount(payment.amount)));
      } else if (payment.value === 'giftCard') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);

        if (payment.changeType) {
          if (payment.changeRefNumber) {
            epsonThermalPrinter.leftRight(
              `   Change (Gift Card)`,
              fCurrency('', roundUpAmount(payment.excessGcAmount))
            );
            epsonThermalPrinter.leftRight(`   Ref No.`, payment.changeRefNumber);
          }

          if (payment.excessCash !== 0) {
            epsonThermalPrinter.leftRight(
              `   Change (Cash)`,
              fCurrency('', roundUpAmount(payment.excessCash))
            );
          }
        }
      } else if (payment.value === 'card') {
        epsonThermalPrinter.leftRight(
          payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
          fCurrency('', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.println(`   Card No. : ************${payment.digitCode}`);
        epsonThermalPrinter.println(`   Slip No. : ${payment.slipNumber}`);
      } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
      } else if (payment.value === 'cardNew') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(
          `   Card No. :`,
          `************${payment.digitCode}`
        );
        epsonThermalPrinter.leftRight(
          `   Approval Code. :`,
          payment.approvalCode
        );
      } else if (payment.value.startsWith('CUSTOM::')) {
        epsonThermalPrinter.leftRight(`   ${payment.label}`, fCurrency('', roundUpAmount(payment.amount)));
        if (payment.digitCode) {
          epsonThermalPrinter.leftRight(`   Card No. :`,  `************${payment.digitCode}`);
        }
        if (payment.referenceNumber) {
          epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
        }
      }
    });

    if (
      cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length ===
      0
    ) {
      epsonThermalPrinter.leftRight(
        '   Change',
        fCurrency('', roundUpAmount(Number(cart.amounts.cashChange)))
      );
    }

    if (cart.payments.filter((x) => x.value === 'rmes').length > 0) {
      const origDate = new Date(
        cart.payments.filter((x) => x.value === 'rmes')[0].origTransactionDate
      );

      epsonThermalPrinter.newLine();
      epsonThermalPrinter.println(
        `Return Ref No. ${cart.payments.filter((x) => x.value === 'rmes')[0].siNumber}`
      );
      epsonThermalPrinter.println(
        `Orig Trans Date: ${origDate.getMonth() + 1 > 9 ? origDate.getMonth() + 1 : `0${origDate.getMonth() + 1}`
        }/${origDate.getDate() > 9 ? origDate.getDate() : `0${origDate.getDate()}`
        }/${origDate.getFullYear()}`
      );
      epsonThermalPrinter.println('Payment Type: Cash');
      epsonThermalPrinter.println('Reason: Change Item');
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`
    );
    epsonThermalPrinter.drawLine();

    let vatableSale = 0;
    let vatAmount = 0;
    let vatExempt = 0;
    let vatZeroRated = 0;
    let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

    if (cart.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'SCD-5%').length > 0) {
      vatExempt += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VAT')
        .forEach((discount) => {
          vatExempt -= discount.amount;
        });
    } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
      vatZeroRated += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VATZR')
        .forEach((discount) => {
          vatZeroRated -= discount.amount;
        });
    } else {
      cart.confirmOrders.forEach((order) => {
        order.products.forEach((specs, specsIndex) => {
          let specsPrice = specs.overridedPrice || specs.price * Number(specs.quantity);

          if (specsIndex === 0) {
            if (cart.discounts) {
              cart.discounts.forEach((discount) => {
                specsPrice -= discount.amount;
              });
            }
          }

          if (specs.discounts) {
            if (
              specs.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX').length > 0
            ) {
              vatExempt += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX')
                .forEach((discount) => {
                  vatExempt -= discount.amount;
                });
            } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  specsPrice -= discount.amount;
                });

              vatAmount -= specsPrice / 1.12 - specsPrice;
              vatableSale += specsPrice / 1.12;
            }
          } else {
            vatableSale += specsPrice / 1.12;
            vatAmount += specsPrice - specsPrice / 1.12;
          }

          if (specs.upgrades) {
            let upgradesPrice = specs.upgrades.price;

            if (specs.upgrades.discounts) {
              if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
                vatExempt += upgradesPrice;

                specs.upgrades.discounts.forEach((discount) => {
                  vatExempt -= discount.amount;
                });
              } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
                vatZeroRated += specsPrice;

                specs.upgrades.discounts
                  .filter((x) => x.prefix === 'VATZR')
                  .forEach((discount) => {
                    vatZeroRated -= discount.amount;
                  });
              } else {
                specs.upgrades.discounts
                  .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                  .forEach((discount) => {
                    upgradesPrice -= discount.amount;
                  });

                vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
                vatableSale += upgradesPrice / 1.12;
              }
            } else {
              vatAmount += upgradesPrice - upgradesPrice / 1.12;
              vatableSale += upgradesPrice / 1.12;
            }
          }
        });
      });
    }

    vatableSale = cart.isNonVat ? 0 : vatableSale;
    vatAmount = cart.isNonVat ? 0 : vatAmount;
    vatExempt = cart.isNonVat ? 0 : vatExempt;
    vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

    epsonThermalPrinter.leftRight('VATable Sale', fCurrency('', roundUpAmount(vatableSale)));
    epsonThermalPrinter.leftRight(`VAT 12%`, fCurrency('', roundUpAmount(vatAmount)));
    epsonThermalPrinter.leftRight('VAT Exempt', fCurrency('', roundUpAmount(vatExempt)));
    epsonThermalPrinter.leftRight('VAT Zero Rated', fCurrency('', roundUpAmount(vatZeroRated)));
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('', roundUpAmount(nonVatable)));
    epsonThermalPrinter.alignRight();
    epsonThermalPrinter.println('----------');
    epsonThermalPrinter.leftRight(
      'Total',
      fCurrency('', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
    );
    epsonThermalPrinter.drawLine();

    if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
      epsonThermalPrinter.println(
        `Customer Loyalty No.: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
        }`
      );
      epsonThermalPrinter.println(
        `Previous Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
        }`
      );
      epsonThermalPrinter.println(
        `Redeemed Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
      epsonThermalPrinter.println(
        `Remaining Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Umbra Digital Company');
    epsonThermalPrinter.println(
      '930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines'
    );
    epsonThermalPrinter.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
    epsonThermalPrinter.println(
      `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued
      }`
    );
    epsonThermalPrinter.println(
      `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
      }`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('Thank you for shopping');
    epsonThermalPrinter.println(
      `Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`
    );

    if (cart.isNonVat) {
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.println('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX');
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printReturn = (cart, cashier, settings) => {
  try {
    const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      interface: `//localhost/${settings.printerName}`,
      width: '33px',
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: true,
      lineCharacter: '-'
    });

    const roundUpAmount = (num) => {
      // num = Math.round(num * 100) / 100;
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cart.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('RETURN');

    let isScPwd = false;
    let scPwdIdNumber = '';
    let type = '';

    cart.discounts
      .filter(
        (x) =>
          x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
      )
      .forEach((discount) => {
        isScPwd = true;
        scPwdIdNumber = discount.idNumber;
        type = discount.prefix;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'SCD' || x.prefix === 'PWD' || x.prefix === 'PNSTMD')
            .forEach((discount) => {
              isScPwd = true;
              scPwdIdNumber = discount.idNumber;
              type = discount.prefix;
            });
        }
      });
    });

    let isVatZR = false;
    let vatZrRepresentative = '';
    let vatZrCert = '';

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        isVatZR = true;
        vatZrRepresentative = discount.idNumber;
        vatZrCert = discount.pecaCertNo;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'VATZR')
            .forEach((discount) => {
              isVatZR = true;
              vatZrRepresentative = discount.idNumber;
              vatZrCert = discount.pecaCertNo;
            });
        }
      });
    });

    epsonThermalPrinter.alignLeft();

    cart.confirmOrders.forEach((order) => {
      epsonThermalPrinter.newLine();

      if (isVatZR) {
        epsonThermalPrinter.println(
          `Customer: ${isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
          } `
        );
      } else if (isScPwd) {
        epsonThermalPrinter.println(
          `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
        );
      } else {
        const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
        epsonThermalPrinter.println(
          `Customer: ${notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
          }`
        );
      }

      epsonThermalPrinter.println('Address:');

      // if (order.discounts) {
      //   if (
      //     order.discounts.filter(
      //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
      //     ).length > 0
      //   ) {
      //     isScPwd = true;
      //   }
      // }

      if (isScPwd) {
        if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
          epsonThermalPrinter.println('SC/PWD TIN:');
        }

        epsonThermalPrinter.println(
          `${type === 'SCD' ||
            type === 'SCD-5%' ||
            type === 'PWD' ||
            (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
            type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
          } ${scPwdIdNumber}`
        );
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignCenter();
        epsonThermalPrinter.println('_______________________');
        epsonThermalPrinter.println('Signature');
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignLeft();
      } else {
        epsonThermalPrinter.println('TIN:');
        epsonThermalPrinter.println('Business Style:');
        epsonThermalPrinter.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

        if (isVatZR) {
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignCenter();
          epsonThermalPrinter.println('_______________________');
          epsonThermalPrinter.println('Signature');
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignLeft();
        }
      }

      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(
        `STORE # ${cart.branchCode}`,
        `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
      );
      epsonThermalPrinter.leftRight(`SI No.: ${cart.newSiNumber}`, 'PHP');
      epsonThermalPrinter.println(`Txn No.: ${cart.newTxnNumber}`);
      epsonThermalPrinter.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

      epsonThermalPrinter.println(
        `Date-time: ${moment(cart.returnDate).format('MM/DD/YYYY - hh:mm A')}`
      );

      epsonThermalPrinter.drawLine();
      epsonThermalPrinter.alignLeft();
      let totalNumItems = 0;
      order.products.forEach((specs) => {
        totalNumItems += 1;
        epsonThermalPrinter.println(
          `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${specs.productName
          }`
        );
        epsonThermalPrinter.leftRight(
          ` -${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
          `${fCurrency(
            '-',
            specs.overridedPrice
              ? roundUpAmount(specs.overridedPrice * specs.quantity)
              : roundUpAmount(specs.price * specs.quantity)
          )}`
        );
        if (specs.discounts) {
          specs.discounts.forEach((discount) => {
            epsonThermalPrinter.leftRight(
              `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }

        // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);

        if (specs.upgrades) {
          totalNumItems += 1;
          epsonThermalPrinter.println(
            `${specs.upgrades.productCode} ${specs.upgrades.productName}`
          );
          epsonThermalPrinter.leftRight(
            ` -1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
            `${fCurrency('-', roundUpAmount(specs.upgrades.price))}`
          );
          if (specs.upgrades.discounts) {
            specs.upgrades.discounts.forEach((discount) => {
              epsonThermalPrinter.leftRight(
                `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
                }`,
                `${fCurrency('-', roundUpAmount(discount.amount))}`
              );
            });
          }
          // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);
        }
      });
      if (order.discounts) {
        epsonThermalPrinter.newLine();
        order.discounts.forEach((discount) => {
          epsonThermalPrinter.leftRight(
            `   LESS (${discount.prefix})`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(`   No. of Items: ${totalNumItems}`, '');
      epsonThermalPrinter.drawLine();
    });
    epsonThermalPrinter.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

    cart.discounts
      .filter((x) => x.prefix !== 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
          }`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });

    cart.discounts
      .filter((x) => x.prefix === 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          '   POINTS REDEEM',
          fCurrency('-', roundUpAmount(discount.amount))
        );
      });

    epsonThermalPrinter.leftRight(
      '   Amount Due',
      fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
    );
    epsonThermalPrinter.leftRight(
      '   Return Within 30 Days',
      fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
    );

    // cart.payments.forEach((payment) => {
    //   if (payment.value === 'cash') {
    //     epsonThermalPrinter.leftRight('   CASH PESO', fCurrency('-', roundUpAmount(payment.amount)));
    //   } else if (payment.value === 'giftCard') {
    //     epsonThermalPrinter.leftRight(
    //       `   ${payment.label}`,
    //       fCurrency('-', roundUpAmount(payment.amount))
    //     );
    //     epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);

    //     if (payment.changeType) {
    //       if (payment.changeRefNumber) {
    //         epsonThermalPrinter.leftRight(
    //           `   Change (Gift Card)`,
    //           fCurrency('-', roundUpAmount(payment.excessGcAmount))
    //         );
    //         epsonThermalPrinter.leftRight(`   Ref No.`, payment.changeRefNumber);
    //       }

    //       if (payment.excessCash !== 0) {
    //         epsonThermalPrinter.leftRight(
    //           `   Change (Cash)`,
    //           fCurrency('-', roundUpAmount(payment.excessCash))
    //         );
    //       }
    //     }
    //   } else if (payment.value === 'card') {
    //     epsonThermalPrinter.leftRight(
    //       payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
    //       fCurrency('-', roundUpAmount(payment.amount))
    //     );
    //     epsonThermalPrinter.println(`   Card No. : ************${payment.digitCode}`);
    //     epsonThermalPrinter.println(`   Slip No. : ${payment.slipNumber}`);
    //   } else if (payment.value === 'eWallet') {
    //     epsonThermalPrinter.leftRight(
    //       `   ${payment.label}`,
    //       fCurrency('-', roundUpAmount(payment.amount))
    //     );
    //     epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
    //   }
    // });

    // if (
    //   cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length === 0
    // ) {
    //   epsonThermalPrinter.leftRight(
    //     '   Change',
    //     fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange)))
    //   );
    // }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(`Orig Store  : ${cart.branchCode}`);
    epsonThermalPrinter.println(
      `Orig POS #  : ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );
    epsonThermalPrinter.println(`Orig Txn No.: ${cart.txnNumber}`);
    epsonThermalPrinter.println(`Orig SI No. : ${cart.siNumber}`);

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`
    );
    epsonThermalPrinter.println(`RETURN Remarks: ${cart.remarks}`);

    let vatableSale = 0;
    let vatAmount = 0;
    let vatExempt = 0;
    let vatZeroRated = 0;
    let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

    if (
      cart.discounts.filter(
        (x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'SCD-5%'
      ).length > 0
    ) {
      vatExempt += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VAT')
        .forEach((discount) => {
          vatExempt -= discount.amount;
        });
    } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
      vatZeroRated += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VATZR')
        .forEach((discount) => {
          vatZeroRated -= discount.amount;
        });
    } else {
      cart.confirmOrders.forEach((order) => {
        order.products.forEach((specs, specsIndex) => {
          let specsPrice = specs.overridedPrice || specs.price * specs.quantity;

          if (specsIndex === 0) {
            if (cart.discounts) {
              cart.discounts.forEach((discount) => {
                specsPrice -= discount.amount;
              });
            }
          }

          if (specs.discounts) {
            if (
              specs.discounts.filter(
                (x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX'
              ).length > 0
            ) {
              vatExempt += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX')
                .forEach((discount) => {
                  vatExempt -= discount.amount;
                });
            } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  specsPrice -= discount.amount;
                });

              vatAmount -= specsPrice / 1.12 - specsPrice;
              vatableSale += specsPrice / 1.12;
            }
          } else {
            vatableSale += specsPrice / 1.12;
            vatAmount += specsPrice - specsPrice / 1.12;
          }

          if (specs.upgrades) {
            let upgradesPrice = specs.upgrades.price;

            if (specs.upgrades.discounts) {
              if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
                vatExempt += upgradesPrice;

                specs.upgrades.discounts.forEach((discount) => {
                  vatExempt -= discount.amount;
                });
              } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
                vatZeroRated += specsPrice;

                specs.upgrades.discounts
                  .filter((x) => x.prefix === 'VATZR')
                  .forEach((discount) => {
                    vatZeroRated -= discount.amount;
                  });
              } else {
                specs.upgrades.discounts
                  .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                  .forEach((discount) => {
                    upgradesPrice -= discount.amount;
                  });

                vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
                vatableSale += upgradesPrice / 1.12;
              }
            } else {
              vatAmount += upgradesPrice - upgradesPrice / 1.12;
              vatableSale += upgradesPrice / 1.12;
            }
          }
        });
      });
    }

    vatableSale = cart.isNonVat ? 0 : vatableSale;
    vatAmount = cart.isNonVat ? 0 : vatAmount;
    vatExempt = cart.isNonVat ? 0 : vatExempt;
    vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
    epsonThermalPrinter.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
    epsonThermalPrinter.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
    epsonThermalPrinter.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
    epsonThermalPrinter.alignRight();
    epsonThermalPrinter.println('----------');
    epsonThermalPrinter.leftRight(
      'Total',
      fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
    );
    epsonThermalPrinter.drawLine();

    if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
      epsonThermalPrinter.println(
        `Customer Loyalty No.: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
        }`
      );
      epsonThermalPrinter.println(
        `Previous Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
        }`
      );
      epsonThermalPrinter.println(
        `Redeemed Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
      epsonThermalPrinter.println(
        `Remaining Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Umbra Digital Company');
    epsonThermalPrinter.println(
      '930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines'
    );
    epsonThermalPrinter.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
    epsonThermalPrinter.println(
      `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued
      }`
    );
    epsonThermalPrinter.println(
      `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
      }`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Thank you for shopping');
    epsonThermalPrinter.println(
      `Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`
    );

    if (cart.isNonVat) {
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.println('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX');
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printVoid = (cart, cashier, settings) => {
  try {
    const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: true,
      lineCharacter: '-',
      width: '33px'
    });

    const roundUpAmount = (num) => {
      // num = Math.round(num * 100) / 100;
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cart.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('VOID');

    let isScPwd = false;
    let scPwdIdNumber = '';
    let type = '';

    cart.discounts
      .filter(
        (x) =>
          x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
      )
      .forEach((discount) => {
        isScPwd = true;
        scPwdIdNumber = discount.idNumber;
        type = discount.prefix;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'SCD' || x.prefix === 'PWD' || x.prefix === 'PNSTMD')
            .forEach((discount) => {
              isScPwd = true;
              scPwdIdNumber = discount.idNumber;
              type = discount.prefix;
            });
        }
      });
    });

    let isVatZR = false;
    let vatZrRepresentative = '';
    let vatZrCert = '';

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        isVatZR = true;
        vatZrRepresentative = discount.idNumber;
        vatZrCert = discount.pecaCertNo;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'VATZR')
            .forEach((discount) => {
              isVatZR = true;
              vatZrRepresentative = discount.idNumber;
              vatZrCert = discount.pecaCertNo;
            });
        }
      });
    });

    epsonThermalPrinter.alignLeft();

    cart.confirmOrders.forEach((order) => {
      epsonThermalPrinter.newLine();

      if (isVatZR) {
        epsonThermalPrinter.println(
          `Customer: ${isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
          } `
        );
      } else if (isScPwd) {
        epsonThermalPrinter.println(
          `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
        );
      } else {
        const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
        epsonThermalPrinter.println(
          `Customer: ${notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
          }`
        );
      }

      epsonThermalPrinter.println('Address:');

      // if (order.discounts) {
      //   if (
      //     order.discounts.filter(
      //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
      //     ).length > 0
      //   ) {
      //     isScPwd = true;
      //   }
      // }

      if (isScPwd) {
        if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
          epsonThermalPrinter.println('SC/PWD TIN:');
        }

        epsonThermalPrinter.println(
          `${type === 'SCD' ||
            type === 'SCD-5%' ||
            type === 'PWD' ||
            (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
            type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
          } ${scPwdIdNumber}`
        );
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignCenter();
        epsonThermalPrinter.println('_______________________');
        epsonThermalPrinter.println('Signature');
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignLeft();
      } else {
        epsonThermalPrinter.println('TIN:');
        epsonThermalPrinter.println('Business Style:');
        epsonThermalPrinter.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

        if (isVatZR) {
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignCenter();
          epsonThermalPrinter.println('_______________________');
          epsonThermalPrinter.println('Signature');
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignLeft();
        }
      }

      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(
        `STORE # ${cart.branchCode}`,
        `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
      );
      epsonThermalPrinter.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
      epsonThermalPrinter.println(`Txn No.: ${cart.newTxnNumber}`);
      epsonThermalPrinter.println(`Void No.: ${cart.voidNumber}`);
      epsonThermalPrinter.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

      epsonThermalPrinter.println(
        `Date-time: ${moment(cart.cartDate).format('MM/DD/YYYY - hh:mm A')}`
      );

      epsonThermalPrinter.drawLine();
      epsonThermalPrinter.alignLeft();
      let totalNumItems = 0;
      order.products.forEach((specs) => {
        totalNumItems += Number(specs.quantity);
        epsonThermalPrinter.println(
          `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${specs.productName
          }`
        );
        epsonThermalPrinter.leftRight(
          ` -${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
          `${fCurrency(
            '-',
            specs.overridedPrice
              ? roundUpAmount(specs.overridedPrice)
              : roundUpAmount(specs.price * Number(specs.quantity))
          )}`
        );
        if (specs.discounts) {
          specs.discounts.forEach((discount) => {
            epsonThermalPrinter.leftRight(
              `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }

        // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);

        if (specs.upgrades) {
          totalNumItems += specs.upgrades.quantity;
          epsonThermalPrinter.println(
            `${specs.upgrades.productCode} ${specs.upgrades.productName}`
          );
          epsonThermalPrinter.leftRight(
            ` -1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
            `${fCurrency('-', roundUpAmount(specs.upgrades.price))}`
          );
          if (specs.upgrades.discounts) {
            specs.upgrades.discounts.forEach((discount) => {
              epsonThermalPrinter.leftRight(
                `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
                }`,
                `${fCurrency('-', roundUpAmount(discount.amount))}`
              );
            });
          }
          // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);
        }
      });
      if (order.discounts) {
        epsonThermalPrinter.newLine();
        order.discounts.forEach((discount) => {
          epsonThermalPrinter.leftRight(
            `   LESS (${discount.prefix})`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(`   No. of Items: ${totalNumItems}`, '');
      epsonThermalPrinter.drawLine();
    });
    epsonThermalPrinter.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

    cart.discounts
      .filter((x) => x.prefix !== 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
          }`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });

    cart.discounts
      .filter((x) => x.prefix === 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          '   POINTS REDEEM',
          fCurrency('-', roundUpAmount(discount.amount))
        );
      });

    epsonThermalPrinter.leftRight(
      '   Amount Due',
      fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
    );

    cart.payments.forEach((payment) => {
      if (payment.value === 'cash') {
        epsonThermalPrinter.leftRight(
          '   CASH PESO',
          fCurrency('-', roundUpAmount(payment.amount))
        );
      } else if (payment.value === 'giftCard') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);

        if (payment.changeType) {
          if (payment.changeRefNumber) {
            epsonThermalPrinter.leftRight(
              `   Change (Gift Card)`,
              fCurrency('-', roundUpAmount(payment.excessGcAmount))
            );
            epsonThermalPrinter.leftRight(`   Ref No.`, payment.changeRefNumber);
          }

          if (payment.excessCash !== 0) {
            epsonThermalPrinter.leftRight(
              `   Change (Cash)`,
              fCurrency('-', roundUpAmount(payment.excessCash))
            );
          }
        }
      } else if (payment.value === 'card') {
        epsonThermalPrinter.leftRight(
          payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.println(`   Card No. : ************${payment.digitCode}`);
        epsonThermalPrinter.println(`   Slip No. : ${payment.slipNumber}`);
      } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
      } else if (payment.value === 'cardNew') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(
          `   Card No. :`,
          `************${payment.digitCode}`
        );
        epsonThermalPrinter.leftRight(
          `   Approval Code. :`,
          payment.approvalCode
        );
      } else if (payment.value.startsWith('CUSTOM::')) {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        if (payment.digitCode) {
          epsonThermalPrinter.leftRight(`   Card No.`, `************${payment.digitCode}`);
        }
        if (payment.referenceNumber) {
          epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
        }
      }
    });

    if (
      cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length ===
      0
    ) {
      epsonThermalPrinter.leftRight(
        '   Change',
        fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange)))
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`
    );
    epsonThermalPrinter.println(`VOID Remarks: ${cart.remarks}`);
    epsonThermalPrinter.drawLine();

    let vatableSale = 0;
    let vatAmount = 0;
    let vatExempt = 0;
    let vatZeroRated = 0;
    let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

    if (cart.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'SCD-5%').length > 0) {
      vatExempt += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VAT')
        .forEach((discount) => {
          vatExempt -= discount.amount;
        });
    } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
      vatZeroRated += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VATZR')
        .forEach((discount) => {
          vatZeroRated -= discount.amount;
        });
    } else {
      cart.confirmOrders.forEach((order) => {
        order.products.forEach((specs, specsIndex) => {
          let specsPrice = specs.overridedPrice || specs.price * Number(specs.quantity);

          if (specsIndex === 0) {
            if (cart.discounts) {
              cart.discounts.forEach((discount) => {
                specsPrice -= discount.amount;
              });
            }
          }

          if (specs.discounts) {
            if (
              specs.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX').length > 0
            ) {
              vatExempt += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX')
                .forEach((discount) => {
                  vatExempt -= discount.amount;
                });
            } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  specsPrice -= discount.amount;
                });

              vatAmount -= specsPrice / 1.12 - specsPrice;
              vatableSale += specsPrice / 1.12;
            }
          } else {
            vatableSale += specsPrice / 1.12;
            vatAmount += specsPrice - specsPrice / 1.12;
          }

          if (specs.upgrades) {
            let upgradesPrice = specs.upgrades.price;

            if (specs.upgrades.discounts) {
              if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
                vatExempt += upgradesPrice;

                specs.upgrades.discounts.forEach((discount) => {
                  vatExempt -= discount.amount;
                });
              } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
                vatZeroRated += specsPrice;

                specs.upgrades.discounts
                  .filter((x) => x.prefix === 'VATZR')
                  .forEach((discount) => {
                    vatZeroRated -= discount.amount;
                  });
              } else {
                specs.upgrades.discounts
                  .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                  .forEach((discount) => {
                    upgradesPrice -= discount.amount;
                  });

                vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
                vatableSale += upgradesPrice / 1.12;
              }
            } else {
              vatAmount += upgradesPrice - upgradesPrice / 1.12;
              vatableSale += upgradesPrice / 1.12;
            }
          }
        });
      });
    }

    vatableSale = cart.isNonVat ? 0 : vatableSale;
    vatAmount = cart.isNonVat ? 0 : vatAmount;
    vatExempt = cart.isNonVat ? 0 : vatExempt;
    vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

    epsonThermalPrinter.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
    epsonThermalPrinter.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
    epsonThermalPrinter.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
    epsonThermalPrinter.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
    epsonThermalPrinter.alignRight();
    epsonThermalPrinter.println('----------');
    epsonThermalPrinter.leftRight(
      'Total',
      fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
    );
    epsonThermalPrinter.drawLine();

    if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
      epsonThermalPrinter.println(
        `Customer Loyalty No.: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
        }`
      );
      epsonThermalPrinter.println(
        `Previous Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
        }`
      );
      epsonThermalPrinter.println(
        `Redeemed Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
      epsonThermalPrinter.println(
        `Remaining Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('THIS DOCUMENT IS NOT VALID FOR ');
    epsonThermalPrinter.println('CLAIM OF INPUT TAX');

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printRefund = (cart, cashier, settings) => {
  try {
    const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: true,
      lineCharacter: '-',
      width: '33px'
    });

    const roundUpAmount = (num) => {
      // num = Math.round(num * 100) / 100;
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cart.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('REFUND');

    let isScPwd = false;
    let scPwdIdNumber = '';
    let type = '';

    cart.discounts
      .filter(
        (x) =>
          x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD' || x.prefix === 'PNSTMD'
      )
      .forEach((discount) => {
        isScPwd = true;
        scPwdIdNumber = discount.idNumber;
        type = discount.prefix;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'SCD' || x.prefix === 'PWD' || x.prefix === 'PNSTMD')
            .forEach((discount) => {
              isScPwd = true;
              scPwdIdNumber = discount.idNumber;
              type = discount.prefix;
            });
        }
      });
    });

    let isVatZR = false;
    let vatZrRepresentative = '';
    let vatZrCert = '';

    cart.discounts
      .filter((x) => x.prefix === 'VATZR')
      .forEach((discount) => {
        isVatZR = true;
        vatZrRepresentative = discount.idNumber;
        vatZrCert = discount.pecaCertNo;
      });

    cart.confirmOrders.forEach((order) => {
      order.products.forEach((product) => {
        if (product.discounts) {
          product.discounts
            .filter((x) => x.prefix === 'VATZR')
            .forEach((discount) => {
              isVatZR = true;
              vatZrRepresentative = discount.idNumber;
              vatZrCert = discount.pecaCertNo;
            });
        }
      });
    });

    epsonThermalPrinter.alignLeft();

    cart.confirmOrders.forEach((order) => {
      epsonThermalPrinter.newLine();

      if (isVatZR) {
        epsonThermalPrinter.println(
          `Customer: ${isVatZR
            ? vatZrRepresentative
            : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
          } `
        );
      } else if (isScPwd) {
        epsonThermalPrinter.println(
          `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
        );
      } else {
        const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
        epsonThermalPrinter.println(
          `Customer: ${notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
          }`
        );
      }

      epsonThermalPrinter.println('Address:');

      // if (order.discounts) {
      //   if (
      //     order.discounts.filter(
      //       (x) => x.prefix === 'SCD' || x.prefix === 'SCD-5%' || x.prefix === 'PWD'
      //     ).length > 0
      //   ) {
      //     isScPwd = true;
      //   }
      // }

      if (isScPwd) {
        if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
          epsonThermalPrinter.println('SC/PWD TIN:');
        }

        epsonThermalPrinter.println(
          `${type === 'SCD' ||
            type === 'SCD-5%' ||
            type === 'PWD' ||
            (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
            type === 'VAT'
            ? 'OSCA ID/PWD ID:'
            : 'PNSTMD ID:'
          } ${scPwdIdNumber}`
        );
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignCenter();
        epsonThermalPrinter.println('_______________________');
        epsonThermalPrinter.println('Signature');
        epsonThermalPrinter.newLine();
        epsonThermalPrinter.alignLeft();
      } else {
        epsonThermalPrinter.println('TIN:');
        epsonThermalPrinter.println('Business Style:');
        epsonThermalPrinter.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

        if (isVatZR) {
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignCenter();
          epsonThermalPrinter.println('_______________________');
          epsonThermalPrinter.println('Signature');
          epsonThermalPrinter.newLine();
          epsonThermalPrinter.alignLeft();
        }
      }

      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(
        `STORE # ${cart.branchCode}`,
        `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
      );
      epsonThermalPrinter.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
      epsonThermalPrinter.println(`Txn No.: ${cart.newTxnNumber}`);
      epsonThermalPrinter.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

      epsonThermalPrinter.println(
        `Date-time: ${moment(cart.cartDate).format('MM/DD/YYYY - hh:mm A')}`
      );

      epsonThermalPrinter.drawLine();
      epsonThermalPrinter.alignLeft();
      let totalNumItems = 0;
      order.products.forEach((specs) => {
        totalNumItems += Number(specs.quantity);
        epsonThermalPrinter.println(
          `${peripherals.includes(specs.productCode) ? specs.productUpgrade : specs.productCode} ${specs.productName
          }`
        );
        epsonThermalPrinter.leftRight(
          ` -${specs.quantity} PIECE @ ${fCurrency('', roundUpAmount(specs.price))}`,
          `${fCurrency(
            '-',
            specs.overridedPrice
              ? roundUpAmount(specs.overridedPrice)
              : roundUpAmount(specs.price * Number(specs.quantity))
          )}`
        );
        if (specs.discounts) {
          specs.discounts.forEach((discount) => {
            epsonThermalPrinter.leftRight(
              `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }

        // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);

        if (specs.upgrades) {
          totalNumItems += specs.upgrades.quantity;
          epsonThermalPrinter.println(
            `${specs.upgrades.productCode} ${specs.upgrades.productName}`
          );
          epsonThermalPrinter.leftRight(
            ` -1 PIECE @ ${fCurrency('', roundUpAmount(specs.upgrades.price))}`,
            `${fCurrency('-', roundUpAmount(specs.upgrades.price))}`
          );
          if (specs.upgrades.discounts) {
            specs.upgrades.discounts.forEach((discount) => {
              epsonThermalPrinter.leftRight(
                `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
                }`,
                `${fCurrency('-', roundUpAmount(discount.amount))}`
              );
            });
          }
          // epsonThermalPrinter.println(`   PO Number  : ${specs.poNumber}`);
        }
      });
      if (order.discounts) {
        epsonThermalPrinter.newLine();
        order.discounts.forEach((discount) => {
          epsonThermalPrinter.leftRight(
            `   LESS (${discount.prefix})`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }
      epsonThermalPrinter.newLine();
      epsonThermalPrinter.leftRight(`   No. of Items: ${totalNumItems}`, '');
      epsonThermalPrinter.drawLine();
    });
    epsonThermalPrinter.leftRight('   Total', fCurrency('-', roundUpAmount(cart.amounts.subtotal)));

    cart.discounts
      .filter((x) => x.prefix !== 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
          }`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });

    cart.discounts
      .filter((x) => x.prefix === 'LOYALTYPOINTS')
      .forEach((discount) => {
        epsonThermalPrinter.leftRight(
          '   POINTS REDEEM',
          fCurrency('-', roundUpAmount(discount.amount))
        );
      });

    epsonThermalPrinter.leftRight(
      '   Amount Due',
      fCurrency('-', fCurrency('-', fCurrency('-', roundUpAmount(cart.amounts.noPayment))))
    );

    cart.payments.forEach((payment) => {
      if (payment.value === 'cash') {
        epsonThermalPrinter.leftRight(
          '   CASH PESO',
          fCurrency('-', roundUpAmount(payment.amount))
        );
      } else if (payment.value === 'giftCard') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);

        if (payment.changeType) {
          if (payment.changeRefNumber) {
            epsonThermalPrinter.leftRight(
              `   Change (Gift Card)`,
              fCurrency('-', roundUpAmount(payment.excessGcAmount))
            );
            epsonThermalPrinter.leftRight(`   Ref No.`, payment.changeRefNumber);
          }

          if (payment.excessCash !== 0) {
            epsonThermalPrinter.leftRight(
              `   Change (Cash)`,
              fCurrency('-', roundUpAmount(payment.excessCash))
            );
          }
        }
      } else if (payment.value === 'card') {
        epsonThermalPrinter.leftRight(
          payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.println(`   Card No. : ************${payment.digitCode}`);
        epsonThermalPrinter.println(`   Slip No. : ${payment.slipNumber}`);
      } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
      } else if (payment.value === 'cardNew') {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        epsonThermalPrinter.leftRight(
          `   Card No. :`,
          `************${payment.digitCode}`
        );
        epsonThermalPrinter.leftRight(
          `   Approval Code. :`,
          payment.approvalCode
        );
      } else if (payment.value.startsWith('CUSTOM::')) {
        epsonThermalPrinter.leftRight(
          `   ${payment.label}`,
          fCurrency('-', roundUpAmount(payment.amount))
        );
        if (payment.digitCode) {
          epsonThermalPrinter.leftRight(`   Card No.`, `************${payment.digitCode}`);
        }
        if (payment.referenceNumber) {
          epsonThermalPrinter.leftRight(`   Ref No.`, payment.referenceNumber);
        }
      }
    });

    if (
      cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length ===
      0
    ) {
      epsonThermalPrinter.leftRight(
        '   Change',
        fCurrency('-', roundUpAmount(Number(cart.amounts.cashChange)))
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`
    );
    epsonThermalPrinter.println(`REFUND Remarks: ${cart.remarks}`);
    epsonThermalPrinter.drawLine();

    let vatableSale = 0;
    let vatAmount = 0;
    let vatExempt = 0;
    let vatZeroRated = 0;
    let nonVatable = cart.isNonVat ? cart.amounts.noPayment : 0;

    if (cart.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'SCD-5%').length > 0) {
      vatExempt += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VAT')
        .forEach((discount) => {
          vatExempt -= discount.amount;
        });
    } else if (cart.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
      vatZeroRated += cart.amounts.subtotal;

      cart.discounts
        .filter((x) => x.prefix === 'VATZR')
        .forEach((discount) => {
          vatZeroRated -= discount.amount;
        });
    } else {
      cart.confirmOrders.forEach((order) => {
        order.products.forEach((specs, specsIndex) => {
          let specsPrice = specs.overridedPrice || specs.price * Number(specs.quantity);

          if (specsIndex === 0) {
            if (cart.discounts) {
              cart.discounts.forEach((discount) => {
                specsPrice -= discount.amount;
              });
            }
          }

          if (specs.discounts) {
            if (
              specs.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX').length > 0
            ) {
              vatExempt += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VAT' || x.prefix === 'VATEX')
                .forEach((discount) => {
                  vatExempt -= discount.amount;
                });
            } else if (specs.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              specs.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              specs.discounts
                .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                .forEach((discount) => {
                  specsPrice -= discount.amount;
                });

              vatAmount -= specsPrice / 1.12 - specsPrice;
              vatableSale += specsPrice / 1.12;
            }
          } else {
            vatableSale += specsPrice / 1.12;
            vatAmount += specsPrice - specsPrice / 1.12;
          }

          if (specs.upgrades) {
            let upgradesPrice = specs.upgrades.price;

            if (specs.upgrades.discounts) {
              if (specs.upgrades.discounts.filter((x) => x.prefix === 'VAT').length > 0) {
                vatExempt += upgradesPrice;

                specs.upgrades.discounts.forEach((discount) => {
                  vatExempt -= discount.amount;
                });
              } else if (specs.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
                vatZeroRated += specsPrice;

                specs.upgrades.discounts
                  .filter((x) => x.prefix === 'VATZR')
                  .forEach((discount) => {
                    vatZeroRated -= discount.amount;
                  });
              } else {
                specs.upgrades.discounts
                  .filter((x) => x.prefix !== 'VAT' && x.prefix !== 'SCD' && x.prefix !== 'PWD')
                  .forEach((discount) => {
                    upgradesPrice -= discount.amount;
                  });

                vatAmount -= upgradesPrice / 1.12 - upgradesPrice;
                vatableSale += upgradesPrice / 1.12;
              }
            } else {
              vatAmount += upgradesPrice - upgradesPrice / 1.12;
              vatableSale += upgradesPrice / 1.12;
            }
          }
        });
      });
    }

    vatableSale = cart.isNonVat ? 0 : vatableSale;
    vatAmount = cart.isNonVat ? 0 : vatAmount;
    vatExempt = cart.isNonVat ? 0 : vatExempt;
    vatZeroRated = cart.isNonVat ? 0 : vatZeroRated;

    epsonThermalPrinter.leftRight('VATable Sale', fCurrency('-', roundUpAmount(vatableSale)));
    epsonThermalPrinter.leftRight(`VAT 12%`, fCurrency('-', roundUpAmount(vatAmount)));
    epsonThermalPrinter.leftRight('VAT Exempt', fCurrency('-', roundUpAmount(vatExempt)));
    epsonThermalPrinter.leftRight('VAT Zero Rated', fCurrency('-', roundUpAmount(vatZeroRated)));
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('-', roundUpAmount(nonVatable)));
    epsonThermalPrinter.alignRight();
    epsonThermalPrinter.println('----------');
    epsonThermalPrinter.leftRight(
      'Total',
      fCurrency('-', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
    );
    epsonThermalPrinter.drawLine();

    if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
      epsonThermalPrinter.println(
        `Customer Loyalty No.: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
        }`
      );
      epsonThermalPrinter.println(
        `Previous Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
        }`
      );
      epsonThermalPrinter.println(
        `Redeemed Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
      epsonThermalPrinter.println(
        `Remaining Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
        cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
        }`
      );
    }

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('THIS DOCUMENT IS NOT VALID FOR ');
    epsonThermalPrinter.println('CLAIM OF INPUT TAX');

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printCashTakeout = (cashReport, total, settings) => {
  try {
    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: false,
      lineCharacter: '-',
      width: '33px'
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

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      cashReport.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
    epsonThermalPrinter.println(
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber} PHP`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('C A S H  T A K E O U T');
    epsonThermalPrinter.newLine();

    // eslint-disable-next-line no-unused-vars
    for (const [key, value] of Object.entries(cash)) {
      if (value.value !== 0) {
        epsonThermalPrinter.println(`${value.label} x ${value.value}`);
      }
    }

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println(`Total      : ${fCurrency('', total.toFixed(2))}`);
    epsonThermalPrinter.newLine();

    epsonThermalPrinter.println(
      `Cashier    : ${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${cashReport.employeeId
      })`
    );
    epsonThermalPrinter.println(`Shift      : ${cashReport.shift}`);

    epsonThermalPrinter.println(
      `Date-time  : ${moment(cashReport.realTimeDate).format('MM/DD/YYYY - hh:mm A')}`
    );

    epsonThermalPrinter.println(`Txn No.    : ${cashReport.txnNumber}`);

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(
      `${cashReport.cashierFirstName.toUpperCase()} ${cashReport.cashierLastName.toUpperCase()} (${cashReport.employeeId
      })`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('___________________________');
    epsonThermalPrinter.println("Cashier's Signature");

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('TURNED OVER BY');

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printXRead = (xReadData, cashier, settings) => {
  try {
    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: false,
      lineCharacter: '-',
      width: '33px'
    });

    const roundUpAmount = (num) => {
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    const printSinglePayment = (data, label) => {
      epsonThermalPrinter.println(`*** ${label} ***`);

      epsonThermalPrinter.leftRight(
        `${label} (${data.count})`,
        fCurrency('', roundUpAmount(data.total))
      );

      epsonThermalPrinter.leftRight(
        `TOTAL ${label} (${data.count})`,
        fCurrency('', roundUpAmount(data.total))
      );
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

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      xReadData.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('X-Reading');
    epsonThermalPrinter.println(
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `SHIFT ${initialFund.INITIAL_FUND.shift
      } of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id}`
    );

    epsonThermalPrinter.println(
      `Store code: ${settings[SettingsCategoryEnum.UnitConfig].storeCode}`
    );

    epsonThermalPrinter.println(
      `Transaction date: ${moment(initialFund.INITIAL_FUND.cashDate).format('MM/DD/YYYY')}`
    );

    epsonThermalPrinter.println(
      `From: ${moment(cashier.shiftFrom).format('MM/DD/YYYY - hh:mm A')}`
    );
    epsonThermalPrinter.leftRight(
      `To: ${moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A')}`,
      'PHP'
    );

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight('Payment (Count)', 'Amount');

    epsonThermalPrinter.alignCenter();

    if (payments.cash.count > 0) {
      epsonThermalPrinter.println('*** CASH ***');
      epsonThermalPrinter.leftRight(
        `CASH PESO (${payments.cash.count})`,
        fCurrency('', roundUpAmount(payments.cash.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL CASH (${payments.cash.count})`,
        fCurrency('', roundUpAmount(payments.cash.total))
      );
    }

    if (payments.cashOnDelivery?.LALAMOVE?.count > 0) {
      epsonThermalPrinter.println('*** LALAMOVE ***');
      epsonThermalPrinter.leftRight(
        `LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
    }

    if (payments.cashOnDelivery?.LBC?.count > 0) {
      epsonThermalPrinter.println('*** LBC ***');
      epsonThermalPrinter.leftRight(
        `LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
    }

    if (payments.cashOnDelivery?.PAYO?.count > 0) {
      epsonThermalPrinter.println('*** PAYO ***');
      epsonThermalPrinter.leftRight(
        `PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
    }

    if (payments.cashOnDelivery?.WSI?.count > 0) {
      epsonThermalPrinter.println('*** WSI ***');
      epsonThermalPrinter.leftRight(
        `WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
    }

    if (payments.cashOnDelivery?.CONSEGNIA?.count > 0) {
      epsonThermalPrinter.println('*** CONSEGNIA ***');
      epsonThermalPrinter.leftRight(
        `CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency(
          '',
          roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total)
        )
      );
      epsonThermalPrinter.leftRight(
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
      epsonThermalPrinter.println('*** CREDIT CARD ***');
      epsonThermalPrinter.leftRight(
        `MASTER CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL CREDIT CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
      );
    }

    if (payments.nonCash.cards.DEBIT_CARD.count > 0) {
      epsonThermalPrinter.println('*** DEBIT CARD ***');
      epsonThermalPrinter.leftRight(
        `EPS (${payments.nonCash.cards.DEBIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.DEBIT_CARD.total))
      );
      epsonThermalPrinter.leftRight(
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
        epsonThermalPrinter.println('*** E-WALLET ***');

        if (payments.nonCash.eWallets.GCASH.count > 0) {
          epsonThermalPrinter.leftRight(
            `GCASH (${payments.nonCash.eWallets.GCASH.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.GCASH.total))
          );
        }

        if (payments.nonCash.eWallets.MAYA.count > 0) {
          epsonThermalPrinter.leftRight(
            `MAYA (${payments.nonCash.eWallets.MAYA.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.MAYA.total))
          );
        }

        if (payments.nonCash.eWallets.PAYMONGO?.count > 0) {
          epsonThermalPrinter.leftRight(
            `PAYMONGO (${payments.nonCash.eWallets.PAYMONGO.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYMONGO.total))
          );
        }

        if (payments.nonCash.eWallets.PAYPAL?.count > 0) {
          epsonThermalPrinter.leftRight(
            `PAYPAL (${payments.nonCash.eWallets.PAYPAL.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYPAL.total))
          );
        }

        epsonThermalPrinter.leftRight(
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
      epsonThermalPrinter.println('*** RETURN ***');
      epsonThermalPrinter.leftRight(
        `RETURN WITHIN 30 DAYS (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL RETURN (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
      );
    }

    if (payments.nonCash.returns.RMES_REDEMPTION.count > 0) {
      epsonThermalPrinter.println('*** EXCHANGE ***');
      epsonThermalPrinter.leftRight(
        `EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
      );
    }

    if (payments.nonCash.giftCards.summary.count > 0) {
      epsonThermalPrinter.println('*** GIFT CARD ***');

      payments.nonCash.giftCards.GC_ITEMS_METHODS.forEach((gift) => {
        epsonThermalPrinter.leftRight(
          `${gift._id.toUpperCase()} (${gift.count})`,
          fCurrency('', roundUpAmount(gift.total))
        );
      });

      if (payments.nonCash.giftCards.summary.EXCESS_GC > 0) {
        epsonThermalPrinter.leftRight(
          'EXCESS GC',
          fCurrency('-', roundUpAmount(payments.nonCash.giftCards.summary.EXCESS_GC))
        );
      }

      epsonThermalPrinter.leftRight(
        `TOTAL GIFT CARD (${payments.nonCash.giftCards.summary.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.giftCards.summary.total))
      );
    }

    if (cashierAudit.NUM_REFUND_TXN && cashierAudit.REFUND_TXN_AMOUNT) {
      epsonThermalPrinter.println('*** REFUND ***');
      epsonThermalPrinter.leftRight(
        `REFUND (${cashierAudit.NUM_REFUND_TXN})`,
        fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT)),
      );
      epsonThermalPrinter.leftRight(
        `TOTAL REFUND (${cashierAudit.NUM_REFUND_TXN})`,
        fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
      );
    }

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight(
      `TOTAL (${payments.summary.count})`,
      fCurrency('', roundUpAmount(payments.summary.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `CASH (${payments.cash.count + (payments.cashOnDelivery?.summary?.count || 0) + (payments.custom?.cash?.summary?.count || 0)})`,
      fCurrency(
        '',
        roundUpAmount(payments.cash.total + (payments.cashOnDelivery?.summary?.total || 0) + (payments.custom?.cash?.summary?.total || 0))
      )
    );
    epsonThermalPrinter.leftRight(
      `NON CASH (${payments.nonCash.summary.count + (payments.custom?.nonCash?.summary?.count || 0)})`,
      fCurrency('', roundUpAmount(payments.nonCash.summary.total + (payments.custom?.nonCash?.summary?.total || 0)))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('Discount (Count)', 'Amount');

    discounts.DISCOUNT_ITEMS.forEach((dc) => {
      const promoCodeLabel = dc.discount === 'PROMOCODE' ? dc.receiptLabel : dc.discount;

      epsonThermalPrinter.leftRight(
        `${dc.discount === 'SCD' ? 'SCD-20%' : promoCodeLabel} (${dc.count})`,
        fCurrency('', roundUpAmount(dc.total))
      );
    });

    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL Discount (${discounts.summary.count})`,
      fCurrency('', roundUpAmount(discounts.summary.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('VAT of ZR & VE (Count)', 'Amount');
    epsonThermalPrinter.leftRight(
      `VAT (${xReadData.isNonVat ? 0 : vat.count})`,
      xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL VAT (${xReadData.isNonVat ? 0 : vat.count})`,
      xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      'VATable Sales',
      fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatableSales)
    );
    epsonThermalPrinter.leftRight(
      'VAT',
      fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatAmount)
    );
    epsonThermalPrinter.leftRight(
      'VAT-Exempt Sales',
      fCurrency('', vat.VAT_DETAILS.vatExemptSales)
    );
    epsonThermalPrinter.leftRight(
      'VAT-Zero Rated Sales',
      fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatZeroRated)
    );
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('', vat.VAT_DETAILS.nonVatable));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('TOTAL NET SALES', fCurrency('', SALES.net));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('Category (Count)', 'Amount');

    department.CATEGORIES.forEach((mat) => {
      epsonThermalPrinter.leftRight(
        ` ${mat.category === 'null' ? 'NO DESC' : mat.category} (${mat.count})`,
        fCurrency('', roundUpAmount(mat.total))
      );
    });

    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL (${department.summary.count})`,
      fCurrency('', roundUpAmount(department.summary.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('INITIAL FUND');
    epsonThermalPrinter.leftRight(
      cashier.id,
      fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
    );
    epsonThermalPrinter.leftRight(
      'TOTAL',
      fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
    );
    epsonThermalPrinter.leftRight(
      'CASH DEPOSIT AMT',
      fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
    );
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('- - - SUBTRACT - - -');
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('CASH DROP');
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight(
      'TOTAL IN DRAWER',
      fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(cashDrop.TOTAL_IN_DRAWER) : '0.00')
    );
    epsonThermalPrinter.println('TOTAL DECLARATION');
    epsonThermalPrinter.leftRight(
      `CASH PESO (${cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS})`,
      fCurrency(
        '',
        takeout ? roundUpAmount(cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION) : '0.00'
      )
    );

    payments.nonCash.giftCards.GC_ITEMS_TYPES.forEach((gift) => {
      epsonThermalPrinter.leftRight(
        `${gift._id.toUpperCase()} (${gift.count})`,
        fCurrency('', roundUpAmount(gift.total))
      );
    });

    if (payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT.total > 0) {
      epsonThermalPrinter.leftRight(
        'GIFT CARD CHANGE',
        fCurrency('-', roundUpAmount(cashDrop.giftCard.GIFT_CARD_CHANGE))
      );
    }

    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      'TOTAL',
      fCurrency('', takeout ? roundUpAmount(FINAL_TOTAL) : '0.00')
    );
    epsonThermalPrinter.leftRight('OVER/SHORT', fCurrency('', roundUpAmount(OVER_SHORT)));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(`CASHIER'S AUDIT`);
    epsonThermalPrinter.leftRight('No. of Items Sold', cashierAudit.NUM_ITEMS_SOLD);
    epsonThermalPrinter.leftRight('No. of Sales Txn', cashierAudit.NUM_SALES_TXN);
    epsonThermalPrinter.leftRight('No. of Non Sales Txn', cashierAudit.NUM_NON_SALES_TXN);
    epsonThermalPrinter.leftRight('Total Txn', cashierAudit.NUM_TOTAL_TXN);
    epsonThermalPrinter.leftRight('No. of Cancelled Txn', cashierAudit.NUM_CANCELLED_TXN);
    epsonThermalPrinter.leftRight(
      'Cancelled Txn. Amt',
      fCurrency('', roundUpAmount(cashierAudit.CANCELLED_TXN_AMOUNT))
    );
    epsonThermalPrinter.leftRight('No. of Suspended Txn', cashierAudit.NUM_SUSPENDED_TXN);
    epsonThermalPrinter.leftRight('No. of Void Txn', cashierAudit.NUM_VOID_TXN);
    epsonThermalPrinter.leftRight(
      'Void Txn. Amt',
      fCurrency('', roundUpAmount(cashierAudit.VOID_TXN_AMOUNT))
    );
    epsonThermalPrinter.leftRight(
      'No. of Refund Txn',
      cashierAudit.NUM_REFUND_TXN ? cashierAudit.NUM_REFUND_TXN : 0
    );
    epsonThermalPrinter.leftRight(
      'Refund Txn. Amt',
      fCurrency(
        '',
        roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT ? cashierAudit.REFUND_TXN_AMOUNT : 0)
      )
    );
    epsonThermalPrinter.leftRight(
      'Discount Amt',
      fCurrency('', roundUpAmount(cashierAudit.TOTAL_DISCOUNT_AMOUNT))
    );
    epsonThermalPrinter.leftRight(
      'Deposit Amt',
      fCurrency('', roundUpAmount(cashierAudit.TOTAL_DEPOSIT_AMOUNT))
    );
    epsonThermalPrinter.leftRight(
      'Ave. Basket',
      fCurrency('', roundUpAmount(cashierAudit.AVE_BASKET))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('Beginning SI No.');
    epsonThermalPrinter.println(SI_NUM.from);
    epsonThermalPrinter.println('Ending SI No.');
    epsonThermalPrinter.println(SI_NUM.to);
    epsonThermalPrinter.println('GENERATED ON');
    epsonThermalPrinter.println(moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A'));
    epsonThermalPrinter.println('Authorized By');
    epsonThermalPrinter.println(
      `${cashier.firstname.toUpperCase()} ${cashier.lastname.toUpperCase()} (${cashier.id})`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Umbra Digital Company');
    epsonThermalPrinter.println(
      '930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines'
    );
    epsonThermalPrinter.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
    epsonThermalPrinter.println(
      `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued
      }`
    );
    epsonThermalPrinter.println(
      `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
      }`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('Thank you for shopping');
    epsonThermalPrinter.println(
      `Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

const printZRead = (zReadData, cashier, settings) => {
  try {
    let epsonThermalPrinter = new ThermalPrinter({
      type: Types.EPSON,
      characterSet: 'SLOVENIA',
      removeSpecialCharacters: false,
      lineCharacter: '-',
      width: '33px'
    });

    const roundUpAmount = (num) => {
      num = Number(num);
      num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

      return num;
    };

    const printSinglePayment = (data, label) => {
      epsonThermalPrinter.println(`*** ${label} ***`);

      epsonThermalPrinter.leftRight(
        `${label} (${data.count})`,
        fCurrency('', roundUpAmount(data.total))
      );

      epsonThermalPrinter.leftRight(
        `TOTAL ${label} (${data.count})`,
        fCurrency('', roundUpAmount(data.total))
      );
    };

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
    } = zReadData;

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
    epsonThermalPrinter.println('Owned & Operated By:');
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
    epsonThermalPrinter.println(
      zReadData.isNonVat
        ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
        : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
    );
    epsonThermalPrinter.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
    epsonThermalPrinter.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
    epsonThermalPrinter.println(settings[SettingsCategoryEnum.UnitConfig].snMin);

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('Z-Reading');
    epsonThermalPrinter.println(
      `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println(
      `SHIFT CLOSING of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id
      }`
    );

    epsonThermalPrinter.println(
      `Store code: ${settings[SettingsCategoryEnum.UnitConfig].storeCode}`
    );

    epsonThermalPrinter.println(
      `Transaction date: ${moment(initialFund.INITIAL_FUND[0].cashDate).format('MM/DD/YYYY')}`
    );

    epsonThermalPrinter.println(
      `From: ${moment(cashier.shiftFrom).format('MM/DD/YYYY - hh:mm A')}`
    );

    epsonThermalPrinter.leftRight(
      `To: ${moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A')}`,
      'PHP'
    );

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight('Payment (Count)', 'Amount');

    epsonThermalPrinter.alignCenter();

    if (payments.cash.count > 0) {
      epsonThermalPrinter.println('*** CASH ***');
      epsonThermalPrinter.leftRight(
        `CASH PESO (${payments.cash.count})`,
        fCurrency('', roundUpAmount(payments.cash.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL CASH (${payments.cash.count})`,
        fCurrency('', roundUpAmount(payments.cash.total))
      );
    }

    if (payments.cashOnDelivery?.LALAMOVE?.count > 0) {
      epsonThermalPrinter.println('*** LALAMOVE ***');
      epsonThermalPrinter.leftRight(
        `LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
    }

    if (payments.cashOnDelivery?.LBC?.count > 0) {
      epsonThermalPrinter.println('*** LBC ***');
      epsonThermalPrinter.leftRight(
        `LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
    }

    if (payments.cashOnDelivery?.PAYO?.count > 0) {
      epsonThermalPrinter.println('*** PAYO ***');
      epsonThermalPrinter.leftRight(
        `PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
    }

    if (payments.cashOnDelivery?.WSI?.count > 0) {
      epsonThermalPrinter.println('*** WSI ***');
      epsonThermalPrinter.leftRight(
        `WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
    }

    if (payments.cashOnDelivery?.CONSEGNIA?.count > 0) {
      epsonThermalPrinter.println('*** CONSEGNIA ***');
      epsonThermalPrinter.leftRight(
        `CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency(
          '',
          roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total)
        )
      );
      epsonThermalPrinter.leftRight(
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
      epsonThermalPrinter.println('*** CREDIT CARD ***');
      epsonThermalPrinter.leftRight(
        `MASTER CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL CREDIT CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
      );
    }

    if (payments.nonCash.cards.DEBIT_CARD.count > 0) {
      epsonThermalPrinter.println('*** DEBIT CARD ***');
      epsonThermalPrinter.leftRight(
        `EPS (${payments.nonCash.cards.DEBIT_CARD.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.cards.DEBIT_CARD.total))
      );
      epsonThermalPrinter.leftRight(
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

    if (zReadData.version === '2.0') {
      if (
        payments.nonCash.eWallets.GCASH.count +
        payments.nonCash.eWallets.MAYA.count +
        (payments.nonCash.eWallets.PAYPAL?.count || 0) +
        (payments.nonCash.eWallets.PAYMONGO?.count || 0) >
        0
      ) {
        epsonThermalPrinter.println('*** E-WALLET ***');

        if (payments.nonCash.eWallets.GCASH.count > 0) {
          epsonThermalPrinter.leftRight(
            `GCASH (${payments.nonCash.eWallets.GCASH.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.GCASH.total))
          );
        }

        if (payments.nonCash.eWallets.MAYA.count > 0) {
          epsonThermalPrinter.leftRight(
            `MAYA (${payments.nonCash.eWallets.MAYA.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.MAYA.total))
          );
        }

        if (payments.nonCash.eWallets.PAYMONGO?.count > 0) {
          epsonThermalPrinter.leftRight(
            `PAYMONGO (${payments.nonCash.eWallets.PAYMONGO.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYMONGO.total))
          );
        }

        if (payments.nonCash.eWallets.PAYPAL?.count > 0) {
          epsonThermalPrinter.leftRight(
            `PAYPAL (${payments.nonCash.eWallets.PAYPAL.count})`,
            fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYPAL.total))
          );
        }

        epsonThermalPrinter.leftRight(
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
      epsonThermalPrinter.println('*** RETURN ***');
      epsonThermalPrinter.leftRight(
        `RETURN WITHIN 30 DAYS (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL RETURN (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
      );
    }

    if (payments.nonCash.returns.RMES_REDEMPTION.count > 0) {
      epsonThermalPrinter.println('*** EXCHANGE ***');
      epsonThermalPrinter.leftRight(
        `EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
      );
      epsonThermalPrinter.leftRight(
        `TOTAL EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
      );
    }

    if (payments.nonCash.giftCards.summary.count > 0) {
      epsonThermalPrinter.println('*** GIFT CARD ***');

      payments.nonCash.giftCards.GC_ITEMS_METHODS.forEach((gift) => {
        epsonThermalPrinter.leftRight(
          `${gift._id.toUpperCase()} (${gift.count})`,
          fCurrency('', roundUpAmount(gift.total))
        );
      });

      if (payments.nonCash.giftCards.summary.EXCESS_GC > 0) {
        epsonThermalPrinter.leftRight(
          'EXCESS GC',
          fCurrency('-', roundUpAmount(payments.nonCash.giftCards.summary.EXCESS_GC))
        );
      }

      epsonThermalPrinter.leftRight(
        `TOTAL GIFT CARD (${payments.nonCash.giftCards.summary.count})`,
        fCurrency('', roundUpAmount(payments.nonCash.giftCards.summary.total))
      );
    }

    if (cashierAudit.NUM_REFUND_TXN && cashierAudit.REFUND_TXN_AMOUNT) {
      epsonThermalPrinter.println('*** REFUND ***');
      epsonThermalPrinter.leftRight(
        `REFUND (${cashierAudit.NUM_REFUND_TXN})`,
        fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT)),
      );
      epsonThermalPrinter.leftRight(
        `TOTAL REFUND (${cashierAudit.NUM_REFUND_TXN})`,
        fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
      );
    }

    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight(
      `TOTAL (${payments.summary.count})`,
      fCurrency('', roundUpAmount(payments.summary.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `CASH (${payments.cash.count + (payments.cashOnDelivery?.summary?.count || 0) + (payments.custom?.cash?.summary?.count || 0)})`,
      fCurrency(
        '',
        roundUpAmount(payments.cash.total + (payments.cashOnDelivery?.summary?.total || 0) + (payments.custom?.cash?.summary?.total || 0))
      )
    );
    epsonThermalPrinter.leftRight(
      `NON CASH (${payments.nonCash.summary.count + (payments.custom?.nonCash?.summary?.count || 0)})`,
      fCurrency('', roundUpAmount(payments.nonCash.summary.total + (payments.custom?.nonCash?.summary?.total || 0)))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('Discount (Count)', 'Amount');

    discounts.DISCOUNT_ITEMS.forEach((dc) => {
      const promoCodeLabel = dc.discount === 'PROMOCODE' ? dc.receiptLabel : dc.discount;

      epsonThermalPrinter.leftRight(
        `${dc.discount === 'SCD' ? 'SCD-20%' : promoCodeLabel} (${dc.count})`,
        fCurrency('', roundUpAmount(dc.total))
      );
    });

    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL Discount (${discounts.summary.count})`,
      fCurrency('', roundUpAmount(discounts.summary.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('VAT of ZR & VE (Count)', 'Amount');
    epsonThermalPrinter.leftRight(
      `VAT (${zReadData.isNonVat ? 0 : vat.count})`,
      zReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL VAT (${zReadData.isNonVat ? 0 : vat.count})`,
      zReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      'VATable Sales',
      fCurrency('', zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatableSales)
    );
    epsonThermalPrinter.leftRight(
      'VAT',
      fCurrency('', zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatAmount)
    );
    epsonThermalPrinter.leftRight(
      'VAT-Exempt Sales',
      fCurrency('', vat.VAT_DETAILS.vatExemptSales)
    );
    epsonThermalPrinter.leftRight(
      'VAT-Zero Rated Sales',
      fCurrency('', zReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatZeroRated)
    );
    epsonThermalPrinter.leftRight('Non-VAT', fCurrency('', vat.VAT_DETAILS.nonVatable));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('TOTAL NET SALES', fCurrency('', SALES.net));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight('Category (Count)', 'Amount');

    department.CATEGORIES.forEach((cat) => {
      epsonThermalPrinter.leftRight(
        ` ${cat.category === 'null' ? 'NO DESC' : cat.category} (${cat.count})`,
        fCurrency('', roundUpAmount(cat.total))
      );
    });


    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      `TOTAL (${department.summary.count})`,
      fCurrency('', fCurrency('', roundUpAmount(department.summary.total)))
    );
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('INITIAL FUND');

    initialFund.INITIAL_FUND.forEach((initial) => {
      epsonThermalPrinter.leftRight(
        initial.employeeId,
        fCurrency('', roundUpAmount(initial.total))
      );
    });

    epsonThermalPrinter.leftRight('TOTAL', fCurrency('', roundUpAmount(initialFund.total)));
    epsonThermalPrinter.leftRight(
      'CASH DEPOSIT AMT',
      fCurrency('', roundUpAmount(initialFund.total))
    );
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('- - - SUBTRACT - - -');
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('CASH DROP');
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.leftRight(
      'TOTAL IN DRAWER',
      fCurrency('', initialFund.INITIAL_FUND[0] ? roundUpAmount(cashDrop.TOTAL_IN_DRAWER) : '0.00')
    );
    epsonThermalPrinter.println('TOTAL DECLARATION');
    epsonThermalPrinter.leftRight(
      `CASH PESO (${cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS})`,
      fCurrency('', roundUpAmount(cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION))
    );

    payments.nonCash.giftCards.GC_ITEMS_TYPES.forEach((gift) => {
      epsonThermalPrinter.leftRight(
        `${gift._id.toUpperCase()} (${gift.count})`,
        fCurrency('', roundUpAmount(gift.total))
      );
    });

    if (payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT.total > 0) {
      epsonThermalPrinter.leftRight(
        'GIFT CARD CHANGE',
        fCurrency('-', roundUpAmount(cashDrop.giftCard.GIFT_CARD_CHANGE))
      );
    }

    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.leftRight(
      'TOTAL',
      fCurrency('', takeout[0] ? roundUpAmount(FINAL_TOTAL) : '0.00')
    );
    epsonThermalPrinter.leftRight('OVER/SHORT', fCurrency('', roundUpAmount(OVER_SHORT)));
    epsonThermalPrinter.drawLine();

    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println(`CASHIER'S AUDIT`);
    epsonThermalPrinter.leftRight('No. of Items Sold', cashierAudit.NUM_ITEMS_SOLD);
    epsonThermalPrinter.leftRight('No. of Sales Txn', cashierAudit.NUM_SALES_TXN);
    epsonThermalPrinter.leftRight('No. of Non Sales Txn', cashierAudit.NUM_NON_SALES_TXN);
    epsonThermalPrinter.leftRight('Total Txn', cashierAudit.NUM_TOTAL_TXN);
    epsonThermalPrinter.leftRight('No. of Cancelled Txn', cashierAudit.NUM_CANCELLED_TXN);
    epsonThermalPrinter.leftRight(
      'Cancelled Txn. Amt',
      fCurrency('', roundUpAmount(cashierAudit.CANCELLED_TXN_AMOUNT))
    );
    epsonThermalPrinter.leftRight('No. of Suspended Txn', cashierAudit.NUM_SUSPENDED_TXN);
    epsonThermalPrinter.leftRight('No. of Void Txn', cashierAudit.NUM_VOID_TXN);
    epsonThermalPrinter.leftRight(
      'Void Txn. Amt',
      fCurrency('', roundUpAmount(cashierAudit.VOID_TXN_AMOUNT ? cashierAudit.VOID_TXN_AMOUNT : 0))
    );
    epsonThermalPrinter.leftRight('No. of Refund Txn', cashierAudit.NUM_REFUND_TXN);
    epsonThermalPrinter.leftRight(
      'Refund Txn. Amt',
      fCurrency(
        '',
        roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT ? cashierAudit.REFUND_TXN_AMOUNT : 0)
      )
    );
    epsonThermalPrinter.leftRight(
      'Discount Amt',
      fCurrency('', roundUpAmount(cashierAudit.TOTAL_DISCOUNT_AMOUNT))
    );
    epsonThermalPrinter.leftRight(
      'Deposit Amt',
      fCurrency('', roundUpAmount(cashierAudit.TOTAL_DEPOSIT_AMOUNT))
    );
    epsonThermalPrinter.leftRight(
      'Ave. Basket',
      fCurrency('', roundUpAmount(cashierAudit.AVE_BASKET))
    );

    epsonThermalPrinter.println('=================================');
    epsonThermalPrinter.alignLeft();
    epsonThermalPrinter.println('OLD ACCUMULATED SALES:');
    epsonThermalPrinter.println(fCurrency('', roundUpAmount(ACCUMULATED_SALES.old)));
    epsonThermalPrinter.println('NEW ACCUMULATED SALES:');
    epsonThermalPrinter.println(fCurrency('', roundUpAmount(ACCUMULATED_SALES.new)));
    epsonThermalPrinter.println(`ZREAD COUNT: ${zReadData.zReadLogsCount + 1}`);
    epsonThermalPrinter.drawLine();
    epsonThermalPrinter.newLine();

    if (VOID_NUM.from !== null) {
      epsonThermalPrinter.alignLeft();
      epsonThermalPrinter.println('Beginning Void No.');
      epsonThermalPrinter.println(VOID_NUM.from);
      epsonThermalPrinter.println('Ending Void No.');
      epsonThermalPrinter.println(VOID_NUM.to);
    }

    epsonThermalPrinter.println('Beginning SI No.');
    epsonThermalPrinter.println(SI_NUM.from);
    epsonThermalPrinter.println('Ending SI No.');
    epsonThermalPrinter.println(SI_NUM.to);
    epsonThermalPrinter.println('GENERATED ON');
    epsonThermalPrinter.println(moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A'));
    epsonThermalPrinter.println('Authorized By');
    epsonThermalPrinter.println(
      cashier.role === 'cashier'
        ? `${zReadData.supervisor.firstname.toUpperCase()} ${zReadData.supervisor.lastname.toUpperCase()}`
        : `${cashier.firstname.toUpperCase()} ${cashier.lastname.toUpperCase()} (${cashier.id})`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.alignCenter();
    epsonThermalPrinter.println('Umbra Digital Company');
    epsonThermalPrinter.println(
      '930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines'
    );
    epsonThermalPrinter.println(`VAT REG TIN: ${settings[SettingsCategoryEnum.BirInfo].vatReg}`);
    epsonThermalPrinter.println(
      `Accreditation: ${settings[SettingsCategoryEnum.BirInfo].accr} Date issued: ${settings[SettingsCategoryEnum.BirInfo].accrDateIssued
      }`
    );
    epsonThermalPrinter.println(
      `PTU No. ${settings[SettingsCategoryEnum.UnitConfig].permit} Date issued: ${settings[SettingsCategoryEnum.UnitConfig].ptuDateIssued
      }`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.println('Thank you for shopping');
    epsonThermalPrinter.println(
      `Visit us at ${settings[SettingsCategoryEnum.CompanyInfo].companyWebsiteLink}`
    );

    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();
    epsonThermalPrinter.newLine();

    return epsonThermalPrinter.getText();
  } catch (err) {
    console.error(err);
  }
};

//
const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};
