const moment = require('moment');
const ThermalPrinter = require('node-thermal-printer').printer;
const Types = require('node-thermal-printer').types;
const numeral = require('numeral');
const { SettingsCategoryEnum } = require('../../controllers/common/settingsData');

const printXReadService = async (printData) => {
  let { apiData, settings } = printData;

  const { xReadData, cashier, isReprint } = apiData;

  if (!printData) {
    const error = new Error('No content to print.');
    error.statusCode = 400;
    throw error;
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
    num = Number(num);
    num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

    return num;
  };

  const printSinglePayment = (data, label) => {
    printer.println(`*** ${label} ***`);

    printer.leftRight(`${label} (${data.count})`, fCurrency('', roundUpAmount(data.total)));

    printer.leftRight(`TOTAL ${label} (${data.count})`, fCurrency('', roundUpAmount(data.total)));
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

  printer.newLine();
  printer.alignCenter();
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].storeName);
  printer.println('Owned & Operated By:');
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyName);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress1);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyAddress2);
  printer.println(settings[SettingsCategoryEnum.CompanyInfo].companyContactNumber ?? '');
  printer.println(
    xReadData.isNonVat
      ? `NON VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
      : `VATReg TIN ${settings[SettingsCategoryEnum.UnitConfig].headerVatReg}`
  );
  printer.println(`ACCR.# ${settings[SettingsCategoryEnum.UnitConfig].headerAccr}`);
  printer.println(`Permit # ${settings[SettingsCategoryEnum.UnitConfig].permit}`);
  printer.println(settings[SettingsCategoryEnum.UnitConfig].snMin);

  printer.newLine();
  printer.println('X-Reading');
  printer.println(`POS # ${settings[SettingsCategoryEnum.UnitConfig].terminalNumber}`);
  isReprint && printer.println('(REPRINT)');

  printer.newLine();
  printer.println(
    `SHIFT ${
      initialFund.INITIAL_FUND.shift
    } of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id}`
  );
  // printer.println(
  //   `SHIFT ${initialFund.INITIAL_FUND[0] && initialFund.INITIAL_FUND[0].shift
  //   } of ${cashier.lastname.toUpperCase()}, ${cashier.firstname.toUpperCase()} - ${cashier.id}`
  // );

  printer.println(`Store code: ${settings[SettingsCategoryEnum.UnitConfig].storeCode}`);

  printer.println(
    `Transaction date: ${moment(initialFund.INITIAL_FUND.cashDate).format('MM/DD/YYYY')}`
  );

  printer.println(`From: ${moment(cashier.shiftFrom).utc().format('MM/DD/YYYY - hh:mm A')}`);
  printer.leftRight(`To: ${moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A')}`, 'PHP');

  printer.drawLine();
  printer.leftRight('Payment (Count)', 'Amount');

  printer.alignCenter();

  if (payments.cash.count > 0) {
    printer.println('*** CASH ***');
    printer.leftRight(
      `CASH PESO (${payments.cash.count})`,
      fCurrency('', roundUpAmount(payments.cash.total))
    );

    printer.leftRight(
      `TOTAL CASH PESO (${payments.cash.count})`,
      fCurrency('', roundUpAmount(payments.cash.total))
    );
  }

  if (payments.cashOnDelivery?.summary?.count > 0) {
    if (payments.cashOnDelivery?.LALAMOVE?.count > 0) {
      printer.println('*** LALAMOVE ***');
      printer.leftRight(
        `LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
      printer.leftRight(
        `TOTAL LALAMOVE (${payments.cashOnDelivery?.LALAMOVE.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LALAMOVE.total))
      );
    }

    if (payments.cashOnDelivery?.LBC?.count > 0) {
      printer.println('*** LBC ***');
      printer.leftRight(
        `LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
      printer.leftRight(
        `TOTAL LBC (${payments.cashOnDelivery?.LBC.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.LBC.total))
      );
    }

    if (payments.cashOnDelivery?.PAYO?.count > 0) {
      printer.println('*** PAYO ***');
      printer.leftRight(
        `PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
      printer.leftRight(
        `TOTAL PAYO (${payments.cashOnDelivery?.PAYO.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.PAYO.total))
      );
    }

    if (payments.cashOnDelivery?.WSI?.count > 0) {
      printer.println('*** WSI ***');
      printer.leftRight(
        `WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
      printer.leftRight(
        `TOTAL WSI (${payments.cashOnDelivery?.WSI.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.WSI.total))
      );
    }

    if (payments.cashOnDelivery?.CONSEGNIA?.count > 0) {
      printer.println('*** CONSEGNIA ***');
      printer.leftRight(
        `CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total))
      );
      printer.leftRight(
        `TOTAL CONSEGNIA (${payments.cashOnDelivery?.CONSEGNIA.count})`,
        fCurrency('', roundUpAmount(payments.cashOnDelivery?.CONSEGNIA.total))
      );
    }
  }

  // custom cash methods
  if (payments.custom?.cash?.summary?.count > 0) {
    payments.custom?.cash?.data?.forEach((item) => {
      printSinglePayment(item, item.title.toUpperCase());
    })
  }

  if (payments.nonCash.cards.CREDIT_CARD.count > 0) {
    printer.println('*** CREDIT CARD ***');
    printer.leftRight(
      `MASTER CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
    );
    printer.leftRight(
      `TOTAL CREDIT CARD (${payments.nonCash.cards.CREDIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.CREDIT_CARD.total))
    );
  }

  if (payments.nonCash.cards.DEBIT_CARD.count > 0) {
    printer.println('*** DEBIT CARD ***');
    printer.leftRight(
      `EPS (${payments.nonCash.cards.DEBIT_CARD.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.cards.DEBIT_CARD.total))
    );
    printer.leftRight(
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
      printer.println('*** E-WALLET ***');

      if (payments.nonCash.eWallets.GCASH.count > 0) {
        printer.leftRight(
          `GCASH (${payments.nonCash.eWallets.GCASH.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.GCASH.total))
        );
      }

      if (payments.nonCash.eWallets.MAYA.count > 0) {
        printer.leftRight(
          `MAYA (${payments.nonCash.eWallets.MAYA.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.MAYA.total))
        );
      }

      if (payments.nonCash.eWallets.PAYMONGO?.count > 0) {
        printer.leftRight(
          `PAYMONGO (${payments.nonCash.eWallets.PAYMONGO.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYMONGO.total))
        );
      }

      if (payments.nonCash.eWallets.PAYPAL?.count > 0) {
        printer.leftRight(
          `PAYPAL (${payments.nonCash.eWallets.PAYPAL.count})`,
          fCurrency('', roundUpAmount(payments.nonCash.eWallets.PAYPAL.total))
        );
      }

      printer.leftRight(
        `TOTAL E-WALLET (${
          payments.nonCash.eWallets.GCASH.count +
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
    printer.println('*** RETURN ***');
    printer.leftRight(
      `RETURN WITHIN 30 DAYS (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
    );
    printer.leftRight(
      `TOTAL RETURN (${payments.nonCash.returns.RMES_ISSUANCE.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_ISSUANCE.total))
    );
  }

  if (payments.nonCash.returns.RMES_REDEMPTION.count > 0) {
    printer.println('*** EXCHANGE ***');
    printer.leftRight(
      `EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
    );
    printer.leftRight(
      `TOTAL EXCHANGE (${payments.nonCash.returns.RMES_REDEMPTION.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.returns.RMES_REDEMPTION.total))
    );
  }

  if (payments.nonCash.giftCards.summary.count > 0) {
    printer.println('*** GIFT CARD ***');

    payments.nonCash.giftCards.GC_ITEMS_METHODS.forEach((gift) => {
      printer.leftRight(
        `${gift._id.toUpperCase()} (${gift.count})`,
        fCurrency('', roundUpAmount(gift.total))
      );
    });

    if (payments.nonCash.giftCards.summary.EXCESS_GC > 0) {
      printer.leftRight(
        'EXCESS GC',
        fCurrency('-', roundUpAmount(payments.nonCash.giftCards.summary.EXCESS_GC))
      );
    }

    printer.leftRight(
      `TOTAL GIFT CARD (${payments.nonCash.giftCards.summary.count})`,
      fCurrency('', roundUpAmount(payments.nonCash.giftCards.summary.total))
    );
  }

  if (cashierAudit.NUM_REFUND_TXN && cashierAudit.REFUND_TXN_AMOUNT) {
    printer.println('*** REFUND ***');
    printer.leftRight(
      `REFUND (${cashierAudit.NUM_REFUND_TXN})`,
      fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
    );
    printer.leftRight(
      `TOTAL REFUND (${cashierAudit.NUM_REFUND_TXN})`,
      fCurrency('', roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT))
    );
  }

  printer.drawLine();
  printer.leftRight(
    `TOTAL (${payments.summary.count})`,
    fCurrency('', roundUpAmount(payments.summary.total))
  );
  printer.drawLine();

  printer.leftRight(
    `CASH (${payments.cash.count + (payments.cashOnDelivery?.summary?.count || 0) + (payments.custom?.cash?.summary?.count || 0)})`,
    fCurrency(
      '',
      roundUpAmount(payments.cash.total + (payments.cashOnDelivery?.summary?.total || 0) + (payments.custom?.cash?.summary?.total || 0))
    )
  );
  printer.leftRight(
    `NON CASH (${payments.nonCash.summary.count + (payments.custom?.nonCash?.summary?.count || 0)})`,
    fCurrency('', roundUpAmount(payments.nonCash.summary.total + (payments.custom?.nonCash?.summary?.total || 0)))
  );
  printer.drawLine();

  printer.leftRight('Discount (Count)', 'Amount');

  discounts.DISCOUNT_ITEMS.forEach((dc) => {
    const promoCodeLabel = dc.discount === 'PROMOCODE' ? dc.receiptLabel : dc.discount;

    printer.leftRight(
      `${dc.discount === 'SCD' ? 'SCD-20%' : promoCodeLabel} (${dc.count})`,
      fCurrency('', roundUpAmount(dc.total))
    );
  });

  printer.drawLine();

  printer.leftRight(
    `TOTAL Discount (${discounts.summary.count})`,
    fCurrency('', roundUpAmount(discounts.summary.total))
  );
  printer.drawLine();

  printer.leftRight('VAT of ZR & VE (Count)', 'Amount');
  printer.leftRight(
    `VAT (${xReadData.isNonVat ? 0 : vat.count})`,
    xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    `TOTAL VAT (${xReadData.isNonVat ? 0 : vat.count})`,
    xReadData.isNonVat ? '0.00' : fCurrency('', roundUpAmount(vat.total))
  );
  printer.drawLine();

  printer.leftRight(
    'VATable Sales',
    fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatableSales)
  );
  printer.leftRight('VAT', fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatAmount));
  printer.leftRight('VAT-Exempt Sales', fCurrency('', vat.VAT_DETAILS.vatExemptSales));
  printer.leftRight(
    'VAT-Zero Rated Sales',
    fCurrency('', xReadData.isNonVat ? 0 : vat.VAT_DETAILS.vatZeroRated)
  );
  printer.leftRight('Non-VAT', fCurrency('', vat.VAT_DETAILS.nonVatable));
  printer.drawLine();

  printer.leftRight('TOTAL NET SALES', fCurrency('', roundUpAmount(SALES.net)));
  printer.drawLine();

  printer.leftRight('Category (Count)', 'Amount');

  department.CATEGORIES.forEach((mat) => {
    printer.leftRight(
      ` ${mat.category === 'null' ? 'NO DESC' : mat.category} (${mat.count})`,
      fCurrency('', roundUpAmount(mat.total))
    );
  });

  printer.drawLine();

  printer.leftRight(
    `TOTAL (${department.summary.count})`,
    fCurrency('', roundUpAmount(department.summary.total))
  );
  printer.drawLine();

  printer.alignLeft();
  printer.println('INITIAL FUND');
  printer.leftRight(
    cashier.id,
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.leftRight(
    'TOTAL',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.leftRight(
    'CASH DEPOSIT AMT',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(initialFund.INITIAL_FUND.total) : '0.00')
  );
  printer.drawLine();
  printer.drawLine();

  printer.alignCenter();
  printer.println('- - - SUBTRACT - - -');
  printer.alignLeft();
  printer.println('CASH DROP');
  printer.drawLine();
  printer.drawLine();
  printer.leftRight(
    'TOTAL IN DRAWER',
    fCurrency('', initialFund.INITIAL_FUND ? roundUpAmount(cashDrop.TOTAL_IN_DRAWER) : '0.00')
  );
  printer.println('TOTAL DECLARATION');
  printer.leftRight(
    `CASH PESO (${cashDrop.totalDeclaration.cash.TOTAL_COUNT_DENOMINATIONS})`,
    fCurrency(
      '',
      takeout ? roundUpAmount(cashDrop.totalDeclaration.cash.TOTAL_CASH_DECLARATION) : '0.00'
    )
  );

  payments.nonCash.giftCards.GC_ITEMS_TYPES.forEach((gift) => {
    printer.leftRight(
      `${gift.type.toUpperCase()} (${gift.count})`,
      fCurrency('', roundUpAmount(gift.total))
    );
  });

  if (payments.nonCash.giftCards.summary.EXCESS_GC_AMOUNT.total > 0) {
    printer.leftRight(
      'GIFT CARD CHANGE',
      fCurrency('-', roundUpAmount(cashDrop.giftCard.GIFT_CARD_CHANGE))
    );
  }

  printer.drawLine();

  printer.leftRight('TOTAL', fCurrency('', takeout ? roundUpAmount(FINAL_TOTAL) : '0.00'));
  printer.leftRight('OVER/SHORT', fCurrency('', roundUpAmount(OVER_SHORT)));
  printer.drawLine();

  printer.alignCenter();
  printer.println(`CASHIER'S AUDIT`);
  printer.leftRight('No. of Items Sold', cashierAudit.NUM_ITEMS_SOLD);
  printer.leftRight('No. of Sales Txn', cashierAudit.NUM_SALES_TXN);
  printer.leftRight('No. of Non Sales Txn', cashierAudit.NUM_NON_SALES_TXN);
  printer.leftRight('Total Txn', cashierAudit.NUM_TOTAL_TXN);
  printer.leftRight('No. of Cancelled Txn', cashierAudit.NUM_CANCELLED_TXN);
  printer.leftRight(
    'Cancelled Txn. Amt',
    fCurrency('', roundUpAmount(cashierAudit.CANCELLED_TXN_AMOUNT))
  );
  printer.leftRight('No. of Suspended Txn', cashierAudit.NUM_SUSPENDED_TXN);
  printer.leftRight('No. of Void Txn', cashierAudit.NUM_VOID_TXN);
  printer.leftRight('Void Txn. Amt', fCurrency('', roundUpAmount(cashierAudit.VOID_TXN_AMOUNT)));
  printer.leftRight(
    'No. of Refund Txn',
    cashierAudit.NUM_REFUND_TXN ? cashierAudit.NUM_REFUND_TXN : 0
  );
  printer.leftRight(
    'Refund Txn. Amt',
    fCurrency(
      '',
      roundUpAmount(cashierAudit.REFUND_TXN_AMOUNT ? cashierAudit.REFUND_TXN_AMOUNT : 0)
    )
  );
  printer.leftRight(
    'Discount Amt',
    fCurrency('', roundUpAmount(cashierAudit.TOTAL_DISCOUNT_AMOUNT))
  );
  printer.leftRight('Deposit Amt', fCurrency('', roundUpAmount(cashierAudit.TOTAL_DEPOSIT_AMOUNT)));
  printer.leftRight('Ave. Basket', fCurrency('', roundUpAmount(cashierAudit.AVE_BASKET)));
  printer.drawLine();
  printer.newLine();
  printer.alignLeft();
  printer.println('Beginning SI No.');
  printer.println(SI_NUM.from);
  printer.println('Ending SI No.');
  printer.println(SI_NUM.to);
  printer.println('GENERATED ON');
  printer.println(moment(cashier.shiftTo).format('MM/DD/YYYY - hh:mm A'));
  printer.println('Authorized By');
  printer.println(
    `${cashier.firstname.toUpperCase()} ${cashier.lastname.toUpperCase()} (${cashier.id})`
  );

  printer.newLine();
  printer.alignCenter();
  printer.println('Umbra Digital Company');
  printer.println('930 unit 510 Aurora Blvd. Cubao, Quezon City, Metro Manila, Philippines');
  printer.println(`VAT REG TIN: ${settings.birInformation.vatReg}`);
  printer.println(
    `Accreditation: ${settings.birInformation.accr} Date issued: ${settings.birInformation.accrDateIssued}`
  );
  printer.println(
    `PTU No. ${settings.unitConfiguration.permit} Date issued: ${settings.unitConfiguration.ptuDateIssued}`
  );

  printer.newLine();
  printer.println('Thank you for shopping');
  printer.println(`Visit us at ${settings.companyInformation.companyWebsiteLink}`);

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

  if (settings[SettingsCategoryEnum.UnitConfig].devMode) {
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
  printXReadService
};
