const HttpError = require('../middleware/http-error');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const moment = require('moment');
const { SettingsCategoryEnum } = require('./common/settingsData');

exports.printReceipt = async (req, res, next) => {
  let { apiData, settings } = req.body;
  const peripherals = ['G100', 'M100', 'S100', 'L100', 'F100'];

  // apiData = JSON.parse(apiData);
  // settings = JSON.parse(settings);

  const { cart, cashier, isReprint } = apiData;

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
    // num = Math.round(num * 100) / 100;
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '')
  
  printer.println(
    cart.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);
  printer.newLine();
  printer.println(isReprint ? 'REPRINT' : 'SALES INVOICE');

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
            scPwdIdNumber = order.idNumber;
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

  printer.alignLeft();

  cart.confirmOrders.forEach((order) => {
    printer.newLine();

    if (isVatZR) {
      printer.println(
        `Customer: ${isVatZR
          ? vatZrRepresentative
          : `${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`
        } `
      );
    } else if (isScPwd) {
      printer.println(
        `Customer: ${`${order.lastName.toUpperCase()}, ${order.firstName.toUpperCase()}`} `
      );
    } else {
      const notGuest = order.firstName && order.firstName.toUpperCase() !== 'GUEST';
      printer.println(
        `Customer: ${notGuest ? order.lastName.toUpperCase() + ', ' + order.firstName.toUpperCase() : ''
        }`
      );
    }

    printer.println('Address:');

    if (isScPwd) {
      if (type === 'SCD' || type === 'SCD-5%' || type === 'PWD') {
        printer.println('SC/PWD TIN:');
      }

      printer.println(
        `${type === 'SCD' ||
          type === 'SCD-5%' ||
          type === 'PWD' ||
          (type === 'VAT' && type === 'PACKAGEDISCOUNT') ||
          type === 'VAT'
          ? 'OSCA ID/PWD ID:'
          : 'PNSTMD ID:'
        } ${scPwdIdNumber}`
      );
      printer.newLine();
      printer.newLine();
      printer.newLine();
      printer.alignCenter();
      printer.println('_______________________');
      printer.println('Signature');
      printer.newLine();
      printer.alignLeft();
    } else {
      printer.println('TIN:');
      printer.println('Business Style:');
      printer.println(isVatZR ? `PEZA Cert No: ${vatZrCert}` : 'OSCA ID/PED ID:');

      if (isVatZR) {
        printer.newLine();
        printer.newLine();
        printer.newLine();
        printer.alignCenter();
        printer.println('_______________________');
        printer.println('Signature');
        printer.newLine();
        printer.alignLeft();
      }
    }

    printer.newLine();
    printer.leftRight(`STORE # ${cart.branchCode}`, `POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);
    printer.leftRight(`SI No.: ${cart.siNumber}`, 'PHP');
    printer.println(`Txn No.: ${cart.txnNumber}`);
    printer.println(`Order ID.: ${cart.confirmOrders[0].orderId}`);

    printer.println(`Date-time: ${moment(cart.cartDate).format('MM-DD-YYYY hh:mm A')}`);

    printer.drawLine();
    printer.alignLeft();

    let totalNumItems = 0;
    order.products.forEach((product) => {
      totalNumItems += Number(product.quantity);

      printer.println(
        `${peripherals.includes(product.productCode) ? product.productUpgrade : product.productCode} ${product.productName
        }`
      );
      printer.leftRight(
        ` ${product.quantity} PIECE @ ${fCurrency('', roundUpAmount(product.price))}`,
        `${fCurrency(
          '',
          product.overridedPrice
            ? roundUpAmount(product.overridedPrice)
            : roundUpAmount(product.price * product.quantity)
        )}`
      );
      if (product.discounts) {
        product.discounts.forEach((discount) => {
          printer.leftRight(
            `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
            }`,
            `${fCurrency('-', roundUpAmount(discount.amount))}`
          );
        });
      }

      // printer.println(`   PO Number  : ${specs.poNumber}`);

      if (product.upgrades) {
        totalNumItems += product.upgrades.quantity;

        printer.println(`${product.upgrades.productCode} ${product.upgrades.itemName}`);
        printer.leftRight(
          ` 1 PIECE @ ${fCurrency('', roundUpAmount(product.upgrades.price))}`,
          `${fCurrency('', roundUpAmount(product.upgrades.price))}`
        );
        if (product.upgrades.discounts) {
          product.upgrades.discounts.forEach((discount) => {
            printer.leftRight(
              `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
              }`,
              `${fCurrency('-', roundUpAmount(discount.amount))}`
            );
          });
        }
        // printer.println(`   PO Number  : ${specs.poNumber}`);
      }
    });
    if (order.discounts) {
      printer.newLine();
      order.discounts.forEach((discount) => {
        printer.leftRight(
          `   LESS (${discount.prefix})`,
          `${fCurrency('-', roundUpAmount(discount.amount))}`
        );
      });
    }
    printer.newLine();
    printer.leftRight(`   No. of Items: ${totalNumItems}`, '');
    printer.drawLine();
  });
  printer.leftRight('   Total', fCurrency('', roundUpAmount(cart.amounts.subtotal)));

  cart.discounts
    .filter((x) => x.prefix !== 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight(
        `   LESS ${discount.receiptLabel} ${discount.prefix === 'PERCENTAGE' ? `${discount.percentageAmount}%` : ''
        }`,
        `${fCurrency('-', roundUpAmount(discount.amount))}`
      );
    });

  cart.discounts
    .filter((x) => x.prefix === 'LOYALTYPOINTS')
    .forEach((discount) => {
      printer.leftRight('   POINTS REDEEM', fCurrency('', roundUpAmount(discount.amount)));
    });

  printer.leftRight(
    '   Amount Due',
    fCurrency('', fCurrency('', fCurrency('', roundUpAmount(cart.amounts.noPayment))))
  );

  cart.payments.forEach((payment) => {
    if (payment.value === 'cash') {
      printer.leftRight('   CASH PESO', fCurrency('', roundUpAmount(payment.amount)));
    } else if (payment.value === 'rmes') {
      printer.leftRight('   EXCHANGE', fCurrency('', roundUpAmount(payment.amount)));
    } else if (payment.value === 'giftCard') {
      printer.leftRight(`   ${payment.label}`, fCurrency('', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);

      if (payment.changeType) {
        if (payment.changeRefNumber) {
          printer.leftRight(
            `   Change (Gift Card)`,
            fCurrency('', roundUpAmount(payment.excessGcAmount))
          );
          printer.leftRight(`   Ref No.`, payment.changeRefNumber);
        }

        if (payment.excessCash !== 0) {
          printer.leftRight(`   Change (Cash)`, fCurrency('', roundUpAmount(payment.excessCash)));
        }
      }
    } else if (payment.value === 'card') {
      printer.leftRight(
        payment.cardType === 'debit-card' ? '   EPS' : '   Mastercard',
        fCurrency('', roundUpAmount(payment.amount))
      );
      printer.println(`   Card No. : ************${payment.digitCode}`);
      printer.println(`   Slip No. : ${payment.slipNumber}`);
    } else if (payment.value === 'eWallet' || payment.value === 'cashOnDelivery') {
      printer.leftRight(`   ${payment.label}`, fCurrency('', roundUpAmount(payment.amount)));
      printer.leftRight(`   Ref No.`, payment.referenceNumber);
    } else if (payment.value.startsWith('CUSTOM::')) {
      printer.leftRight(`   ${payment.label}`, fCurrency('', roundUpAmount(payment.amount)));
      if (payment.digitCode) {
        printer.leftRight(`   Card No. :`, `************${payment.digitCode}`);
      }
      if (payment.referenceNumber) {
        printer.leftRight(`   Ref No.`, payment.referenceNumber);
      }
    }
  });

  if (
    cart.payments.filter((x) => x.changeType === 'giftCard' || x.changeType === 'cash').length === 0
  ) {
    printer.leftRight('   Change', fCurrency('', roundUpAmount(Number(cart.amounts.cashChange))));
  }

  if (cart.payments.filter((x) => x.value === 'rmes').length > 0) {
    const origDate = new Date(
      cart.payments.filter((x) => x.value === 'rmes')[0].origTransactionDate
    );

    printer.newLine();
    printer.println(
      `Return Ref No. ${cart.payments.filter((x) => x.value === 'rmes')[0].siNumber}`
    );
    printer.println(
      `Orig Trans Date: ${origDate.getMonth() + 1 > 9 ? origDate.getMonth() + 1 : `0${origDate.getMonth() + 1}`
      }/${origDate.getDate() > 9 ? origDate.getDate() : `0${origDate.getDate()}`
      }/${origDate.getFullYear()}`
    );
    printer.println('Payment Type: Cash');
    printer.println('Reason: Change Item');
  }

  printer.newLine();
  printer.println(`Cashier: ${cashier.lastname}, ${cashier.firstname} [${cashier.id}]`);
  printer.println(`Remarks: ${cart.remarks ?? ''}`)
  printer.drawLine();

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
      order.products.forEach((product, specsIndex) => {
        let specsPrice = product.overridedPrice || product.price * product.quantity;

        if (specsIndex === 0) {
          if (cart.discounts) {
            cart.discounts.forEach((discount) => {
              specsPrice -= discount.amount;
            });
          }
        }

        if (product.discounts) {
          if (
            product.discounts.filter(
              (x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX'
            ).length > 0
          ) {
            vatExempt += specsPrice;

            product.discounts
              .filter((x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS' || x.prefix === 'VATEX')
              .forEach((discount) => {
                vatExempt -= discount.amount;
              });
          } else if (product.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
            vatZeroRated += specsPrice;

            product.discounts
              .filter((x) => x.prefix === 'VATZR')
              .forEach((discount) => {
                vatZeroRated -= discount.amount;
              });
          } else if (product.discounts.filter((x) => x.prefix === 'PNSTMD').length > 0) {
            let pnstmdDiscountAmount = 0;
            product.discounts
              .filter((x) => x.prefix === 'PNSTMD')
              .forEach((discount) => {
                specsPrice = settings[SettingsCategoryEnum.UnitConfig].mallAccr === 'sm' ? specsPrice : specsPrice - discount.amount;
                pnstmdDiscountAmount += discount.amount;
              });

            if (settings[SettingsCategoryEnum.UnitConfig].mallAccr === 'sm') {
              vatAmount = specsPrice - (specsPrice / 1.12);
              vatableSale = specsPrice - vatAmount - pnstmdDiscountAmount;
            } else {
              vatAmount = specsPrice - (specsPrice / 1.12);
              vatableSale += specsPrice / 1.12;
            }
          } else {
            product.discounts
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

        if (product.upgrades) {
          let upgradesPrice = product.upgrades.price;

          if (product.upgrades.discounts) {
            if (
              product.upgrades.discounts.filter((x) => x.prefix === 'VAT' || x.prefix === 'DPLMTS')
                .length > 0
            ) {
              vatExempt += upgradesPrice;

              product.upgrades.discounts.forEach((discount) => {
                vatExempt -= discount.amount;
              });
            } else if (product.upgrades.discounts.filter((x) => x.prefix === 'VATZR').length > 0) {
              vatZeroRated += specsPrice;

              product.upgrades.discounts
                .filter((x) => x.prefix === 'VATZR')
                .forEach((discount) => {
                  vatZeroRated -= discount.amount;
                });
            } else {
              product.upgrades.discounts
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

  printer.leftRight('VATable Sale', fCurrency('', roundUpAmount(vatableSale)));
  printer.leftRight(`VAT 12%`, fCurrency('', roundUpAmount(vatAmount)));
  printer.leftRight('VAT Exempt', fCurrency('', roundUpAmount(vatExempt)));
  printer.leftRight('VAT Zero Rated', fCurrency('', roundUpAmount(vatZeroRated)));
  printer.leftRight('Non-VAT', fCurrency('', roundUpAmount(nonVatable)));
  printer.alignRight();
  printer.println('----------');
  printer.leftRight(
    'Total',
    fCurrency('', roundUpAmount(vatableSale + vatAmount + vatExempt + vatZeroRated + nonVatable))
  );
  printer.drawLine();

  if (cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS').length > 0) {
    printer.println(
      `Customer Loyalty No.: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].customerLoyaltyId
      }`
    );
    printer.println(
      `Previous Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints
      }`
    );
    printer.println(
      `Redeemed Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
    printer.println(
      `Remaining Points: ${cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].previousPoints -
      cart.discounts.filter((x) => x.prefix === 'LOYALTYPOINTS')[0].redeemedPoints
      }`
    );
  }

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

  if (cart.isNonVat) {
    printer.newLine();
    printer.println('THIS DOCUMENT IS NOT VALID FOR CLAIM OF INPUT TAX');
  }

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

const fCurrency = (currency, number) => {
  return `${currency}${numeral(number).format(Number.isInteger(number) ? '0,0' : '0,0.00')}`;
};
