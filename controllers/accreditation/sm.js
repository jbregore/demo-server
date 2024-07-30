const os = require('os');
const moment = require('moment');
const path = require('path');
const fs = require('fs');
const HttpError = require('../../middleware/http-error');
const Papa = require('papaparse');
const Preview = require('../../models/Preview');
const TransactionAmount = require('../../models/TransactionAmount');
const Transaction = require('../../models/Transaction');
const { SettingsCategoryEnum } = require('../common/settingsData');

const DAYS_TO_SUBTRACT = 30;

const cDrivePath = path.join(os.homedir().split(path.sep)[0], path.sep);

exports.saveTransaction = async (req, res, next) => {
  try {
    const { cart, transactionDate, transactionType, settings, originalTxnNumber } = req.body;
    const { snMin } = settings[SettingsCategoryEnum.UnitConfig];
    const serialNumber = snMin?.split('/')?.[0].split(' ')?.[1] ?? '';

    const headers = [
      'Order Num/Bill',
      'Business Day',
      'Check Open',
      'Check Close',
      'Sales Type',
      'Transaction Type',
      'Void',
      'Void Amount',
      'Refund',
      'Refund Amount',
      'Guest Count',
      'Guest Count (Senior)',
      'Guest Count (PWD)',
      'Gross Sales Amount',
      'Net Sales Amount',
      'Total Tax',
      'Other/Local Tax',
      'Total Service Charge',
      'Total Tip',
      'Total Discount',
      'Less Tax Amount',
      'Tax Exempt Sales',
      'Regular/Other Discount Name',
      'Regular/Other Discount Amount',
      'Employee Discount Amount',
      'Senior Citizen Discount Amount',
      'VIP Discount Amount',
      'PWD Discount Amount',
      'National Coach / Athlete /  Medal of Valor Discount amount',
      'SMAC Discount',
      'Online Deals Discount Name',
      'Online Deals Discount Amount',
      'Discount Field 1 Name',
      'Discount Field 2 Name',
      'Discount Field 3 Name',
      'Discount Field 4 Name',
      'Discount Field 5 Name',
      'Discount Field 6 Name',
      'Discount Field 1 Amount',
      'Discount Field 2 Amount',
      'Discount Field 3 Amount',
      'Discount Field 4 Amount',
      'Discount Field 5 Amount',
      'Discount Field 6 Amount',
      'Payment Type_1',
      'Payment Amount_1',
      'Payment Type_2',
      'Payment Amount_2',
      'Payment Type_3',
      'Payment Amount_3',
      'Total Cash Sales Amount',
      'Total Gift Cheque / Gift Card Sales Amount',
      'Total Debit Card Sales Amount',
      'Total E-wallet / Online Sales Amount',
      'Total Other Tender Sales Amount',
      'Total Mastercard Sales Amount',
      'Total Visa Sales Amount',
      'Total American Express Sales Amount',
      'Total Diners Sales Amount',
      'Total JCB Sales Amount',
      'Total Other Credit Card Sales Amount',
      'Terminal Number',
      'Serial Number'
    ];

    const txnNumber =
      transactionType === 'return'
        ? cart.origTxnNumber
        : transactionType === 'refund'
          ? originalTxnNumber
          : cart.txnNumber;

    // Get the VAT amounts in _pos_txn_amounts
    const transactionAmounts = await TransactionAmount.find({
      storeCode: settings[SettingsCategoryEnum.UnitConfig].storeCode,
      txnNumber: txnNumber
    });

    let totalVatEx = 0;
    let totalSCD = 0;
    let totalPWD = 0;
    let totalVIP = 0;
    let totalEmployee = 0;
    let totalAthlete = 0;
    let totalTaxExempt = parseFloat(transactionAmounts?.[0]?.vatExempt) ?? 0;

    // Get all item discounts for each item
    let allDiscounts = [];
    cart.confirmOrders[0].products.forEach((item) => {
      item.discounts?.forEach((discount) => {
        allDiscounts.push(discount);
      });
    });

    // Get SCD and PWD id numbers
    const scdIds = [];
    const pwdIds = [];

    // Get Total Discount amount from transaction discounts;
    const totalDiscounts = [
      ...(cart.discounts?.length > 0 ? cart.discounts : []),
      ...allDiscounts
    ].reduce((acc, discount) => {
      if (discount.label === 'VAT' || discount.label === 'VAT EX' || discount.label === 'VAT ZR') {
        totalVatEx = totalVatEx + discount.amount;
        return acc;
      } else if (discount.label === 'Senior Citizen (20%)') {
        totalSCD = totalSCD + discount.amount;
        totalTaxExempt -= discount.amount;

        if (!scdIds.includes(discount.idNumber)) {
          scdIds.push(discount.idNumber);
        }
      } else if (discount.label === 'PWD (20%)') {
        totalPWD = totalPWD + discount.amount;
        totalTaxExempt -= discount.amount;

        if (!pwdIds.includes(discount.idNumber)) {
          pwdIds.push(discount.idNumber);
        }
      } else if (discount.label === 'PNSTMD (20%)') {
        totalAthlete = totalAthlete + discount.amount;
      } else if (discount.label === 'Vip') {
        totalVIP = totalVIP + discount.amount;
      } else if (discount.label === 'Employee') {
        totalEmployee = totalEmployee + discount.amount;
      }

      return acc + discount.amount;
    }, 0);

    // Get other discounts
    let otherDiscounts = [];
    let otherDiscountsAmount = [];

    const discountNames = [...(cart.discounts?.length > 0 ? cart.discounts : []), ...allDiscounts]
      .filter((discount) => {
        if (
          [
            'VAT EX',
            'VAT',
            'Senior Citizen (20%)',
            'PWD (20%)',
            'Vip',
            'Employee',
            'PNSTMD (20%)',
            'VAT ZR'
          ].includes(discount.label)
        )
          return false;
        return true;
      })
      .reduce((prev, discount) => {
        let fieldName = '';
        let label = '';

        if (discount.prefix === 'PROMOCODE') {
          fieldName = discount.promoCodeId;
          label = `${discount.promoCodeId}=${discount.label}`;
        } else {
          fieldName = discount.label;
          label = `${discount.label}=${formatNumber(discount.amount)}`;
        }

        if (prev[`${fieldName}`]) {
          const prevTotal = prev[`${fieldName}`].total;
          if (discount.prefix !== 'PROMOCODE') {
            prev[`${fieldName}`].label = `${discount.label}=${prevTotal + discount.amount}`;
          }
          prev[`${fieldName}`].total += discount.amount;
          return prev;
        } else {
          return (prev = {
            ...prev,
            [`${fieldName}`]: {
              label,
              total: discount.amount
            }
          });
        }
      }, {});

    Object.keys(discountNames).forEach((discountName) => {
      otherDiscounts.push(discountNames[`${discountName}`].label);
      otherDiscountsAmount.push(formatNumber(discountNames[`${discountName}`].total));
    });

    const row = {
      orderNum: cart.siNumber,
      businessDay: transactionDate,
      checkOpen: `${transactionDate} ${cart.cartDate.split(' ')[1]}`,
      checkClose: `${transactionDate} ${cart.cartDate.split(' ')[1]}`,
      salesType: settings[SettingsCategoryEnum.UnitConfig].smSalesType,
      transactionType: settings[SettingsCategoryEnum.UnitConfig].smTransactionType,
      void: transactionType === 'void' ? 1 : 0,
      voidAmount: transactionType === 'void' ? cart.amounts.noPayment : 0,
      refund: transactionType === 'refund' || transactionType === 'return' ? 1 : 0,
      refundAmount:
        transactionType === 'refund' || transactionType === 'return'
          ? (transactionType === 'refund' ? -1 : 1) * cart.amounts.noPayment
          : 0,
      guestCount: 1,
      guestCountSenior: scdIds.length,
      guestCountPWD: pwdIds.length,
      grossSalesAmount: ['void', 'return'].includes(transactionType)
        ? '0.00'
        : parseFloat(
          transactionType === 'refund'
            ? -1 * cart.amounts.originalTotal
            : cart.amounts.originalTotal
        ).toFixed(2),
      netSalesAmount: ['void', 'return'].includes(transactionType)
        ? '0.00'
        : parseFloat(
          (transactionType === 'refund' ? -1 : 1) *
          ((transactionAmounts[0].vatableSale ?? 0) + totalTaxExempt)
        ).toFixed(2),
      totalTax: ['void', 'return'].includes(transactionType)
        ? 0
        : parseFloat(
          // eslint-disable-next-line
          (transactionType === 'refund' ? -1 : 1) * transactionAmounts[0].vatAmount ?? 0
        ).toFixed(2),
      totalLocalTax: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalServiceCharge: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalTip: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalDiscounts,
      lessTaxAmount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalVatEx,
      totalTaxExemptSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : totalTaxExempt ?? 0,
      otherDiscountsName: ['void', 'refund', 'return'].includes(transactionType)
        ? ''
        : otherDiscounts.join('::'),
      otherDiscountsAmount: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : otherDiscountsAmount.length === 0
          ? 0
          : otherDiscountsAmount.join('::'),
      employeeDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalEmployee,
      seniorCitizenDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalSCD,
      pwdDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalPWD,
      vipDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalVIP,
      athleteDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : totalAthlete,
      smacDiscount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      onlineDealsDiscountName: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      onlineDealsDiscountAmount: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      discountField1Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField2Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField3Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField4Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField5Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField6Name: ['void', 'refund', 'return'].includes(transactionType) ? '' : '',
      discountField1Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      discountField2Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      discountField3Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      discountField4Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      discountField5Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      discountField6Amount: ['void', 'refund', 'return'].includes(transactionType) ? '0' : '0',
      paymentType1: ['void', 'refund', 'return'].includes(transactionType)
        ? ''
        : cart.payments[0]?.label ?? '',
      paymentType1Amount: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments[0]?.amount ?? 0,
      paymentType2: ['void', 'refund', 'return'].includes(transactionType)
        ? ''
        : cart.payments[1]?.label ?? '',
      paymentType2Amount: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments[1]?.amount ?? 0,
      paymentType3: ['void', 'refund', 'return'].includes(transactionType)
        ? ''
        : cart.payments[2]?.label ?? '',
      paymentType3Amount: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments[2]?.amount ?? 0,
      totalCashSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments.reduce(
          (acc, payment) => (acc += payment.value === 'cash' ? payment.amount : 0),
          0
        ),
      totalGiftChequeCardSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments.reduce(
          (acc, payment) => (acc += payment.value === 'giftCard' ? payment.amount : 0),
          0
        ),
      totalDebitCardSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments.reduce(
          (acc, payment) =>
          (acc +=
            payment.value === 'card' && payment.cardType === 'debit-card' ? payment.amount : 0),
          0
        ),
      totalEwalletSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments.reduce(
          (acc, payment) => (acc += payment.value === 'eWallet' ? payment.amount : 0),
          0
        ),
      totalOtherTenderSales: 0,
      totalMastercardSales: ['void', 'refund', 'return'].includes(transactionType)
        ? 0
        : cart.payments.reduce(
          (acc, payment) =>
          (acc +=
            payment.value === 'card' && payment.cardType === 'credit-card'
              ? payment.amount
              : 0),
          0
        ),
      totalVisaSales: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalAmexSales: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalDinersSales: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalJCBSales: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      totalOtherCreditCardSales: ['void', 'refund', 'return'].includes(transactionType) ? 0 : 0,
      terminalNumber: settings[SettingsCategoryEnum.UnitConfig].terminalNumber,
      serialNumber: serialNumber.trim()
    };

    const rowData = [
      row.orderNum,
      row.businessDay,
      row.checkOpen,
      row.checkClose,
      row.salesType,
      row.transactionType,
      row.void,
      formatNumber(row.voidAmount),
      row.refund,
      formatNumber(row.refundAmount),
      row.guestCount,
      row.guestCountSenior,
      row.guestCountPWD,
      formatNumber(row.grossSalesAmount),
      formatNumber(row.netSalesAmount),
      formatNumber(row.totalTax),
      formatNumber(row.totalLocalTax),
      formatNumber(row.totalServiceCharge),
      formatNumber(row.totalTip),
      formatNumber(row.totalDiscount),
      formatNumber(row.lessTaxAmount),
      formatNumber(row.totalTaxExemptSales),
      row.otherDiscountsName,
      row.otherDiscountsAmount,
      formatNumber(row.employeeDiscount),
      formatNumber(row.seniorCitizenDiscount),
      formatNumber(row.vipDiscount),
      formatNumber(row.pwdDiscount),
      formatNumber(row.athleteDiscount),
      formatNumber(row.smacDiscount),
      row.onlineDealsDiscountName,
      row.onlineDealsDiscountAmount,
      row.discountField1Name,
      row.discountField2Name,
      row.discountField3Name,
      row.discountField4Name,
      row.discountField5Name,
      row.discountField6Name,
      row.discountField1Amount,
      row.discountField2Amount,
      row.discountField3Amount,
      row.discountField4Amount,
      row.discountField5Amount,
      row.discountField6Amount,
      row.paymentType1,
      row.paymentType1Amount,
      row.paymentType2,
      row.paymentType2Amount,
      row.paymentType3,
      row.paymentType3Amount,
      formatNumber(row.totalCashSales),
      formatNumber(row.totalGiftChequeCardSales),
      formatNumber(row.totalDebitCardSales),
      formatNumber(row.totalEwalletSales),
      formatNumber(row.totalOtherTenderSales),
      formatNumber(row.totalMastercardSales),
      formatNumber(row.totalVisaSales),
      formatNumber(row.totalAmexSales),
      formatNumber(row.totalDinersSales),
      formatNumber(row.totalJCBSales),
      formatNumber(row.totalOtherCreditCardSales),
      row.terminalNumber,
      row.serialNumber
    ];

    const urlPath = path.join(cDrivePath, 'SIA');
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

    const [year, month] = transactionDate.split('-');
    const fileName = `${month}_${year}_transactions.csv`;
    const fileExists = fs.existsSync(path.join(urlPath, fileName));

    const newRow = {};
    headers.forEach((header, index) => {
      newRow[`${header}`] = rowData[index];
    });

    if (!fileExists) {
      const newCsv = [newRow];
      fs.writeFileSync(
        path.join(urlPath, fileName),
        Papa.unparse(newCsv, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
      );
    } else {
      const fileData = fs.createReadStream(path.join(urlPath, fileName));
      const parseCsv = (fileData) => {
        return new Promise((resolve, reject) => {
          Papa.parse(fileData, {
            header: true,
            complete: (results) => {
              resolve(results.data);
            },
            error: (err) => {
              reject(err);
            }
          });
        });
      };

      const parsedCsv = await parseCsv(fileData);
      const newCsv = [...parsedCsv, newRow];
      fs.writeFileSync(
        path.join(urlPath, fileName),
        Papa.unparse(newCsv, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
      );

      return res.status(200).json({ message: 'Successfully added record.' });
    }

    return res.status(200).json({ message: 'Successfully added record.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong on saving the report.');
    next(error);
  }
};

exports.saveTransactionDetails = async (req, res, next) => {
  try {
    const { transactionType, transactionDate, cart } = req.body;

    const urlPath = path.join(cDrivePath, 'SIA');
    !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

    const [year, month] = transactionDate.split('-');
    const fileName = `${month}_${year}_transactiondetails.csv`;

    let transactionDiscounts = [];
    if (cart.discounts) {
      cart.discounts.forEach((discount) => {
        if (discount.label === 'VAT EX' || discount.label === 'VAT ZR') return;

        const singleDiscount = {
          ...discount,
          amount: discount.amount / cart.confirmOrders[0].products.length
        };
        transactionDiscounts.push(singleDiscount);
      });
    }

    const items = cart.confirmOrders[0]?.products;
    const rows = items.map((item) => {
      return {
        'Order Num / Bill Num': cart.siNumber,
        'Item ID': item.productCode,
        'Item Name': item.productName,
        'Item Category': item.categoryName,
        'Item Quantity': item.quantity,
        'Transaction Item Price':
          transactionType === 'regular'
            ? formatNumber(
              item.price -
              [...(item.discounts?.length > 0 ? item.discounts : []), ...transactionDiscounts]
                .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
                .reduce((acc, curr) => acc + curr.amount, 0)
            )
            : 0,
        'Menu Item Price': formatNumber(item.price),
        'Discount Code':
          transactionType === 'regular'
            ? [...(item.discounts?.length > 0 ? item.discounts : []), ...transactionDiscounts]
              .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
              .map((discount) => discount.label)
              .join('::')
            : '',
        'Discount Amount':
          transactionType === 'regular'
            ? formatNumber(
              [...(item.discounts?.length > 0 ? item.discounts : []), ...transactionDiscounts]
                .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
                .reduce((acc, curr) => acc + curr.amount, 0)
            )
            : 0,
        'Modifier (1) Name': '',
        'Modifier (1) Quantity': 0,
        'Modifier (2) Name': '',
        'Modifier (2) Quantity': 0,
        Void: transactionType === 'void' ? 1 : 0,
        'Void Amount':
          transactionType === 'void'
            ? formatNumber(
              item.price -
              [
                ...(item.discounts?.length > 0 ? item.discounts : []),
                ...transactionDiscounts
              ].reduce((acc, curr) => acc + curr.amount, 0)
            )
            : 0,
        Refund: transactionType === 'refund' || transactionType === 'return' ? 1 : 0,
        'Refund Amount':
          transactionType === 'refund' || transactionType === 'return'
            ? formatNumber(
              item.price -
              [
                ...(item.discounts?.length > 0 ? item.discounts : []),
                ...transactionDiscounts
              ].reduce((acc, curr) => acc + curr.amount, 0)
            )
            : 0
      };
    });

    const fileExists = fs.existsSync(path.join(urlPath, fileName));
    if (!fileExists) {
      const newCsv = rows;
      fs.writeFileSync(
        path.join(urlPath, fileName),
        Papa.unparse(newCsv, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
      );
    } else {
      const fileData = fs.createReadStream(path.join(urlPath, fileName));
      const parseCsv = (fileData) => {
        return new Promise((resolve, reject) => {
          Papa.parse(fileData, {
            header: true,
            complete: (results) => {
              resolve(results.data);
            },
            error: (err) => {
              reject(err);
            }
          });
        });
      };

      const parsedCsv = await parseCsv(fileData);
      const newCsv = [...parsedCsv, ...rows];
      fs.writeFileSync(
        path.join(urlPath, fileName),
        Papa.unparse(newCsv, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
      );

      return res.status(200).json({ message: 'Successfully added record.' });
    }

    res.status(200).json({ message: 'Successfully added record.' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong on saving the report.');
    next(error);
  }
};

exports.updateTransactions = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const [year, month] = transactionDate.split('-');
    const urlPath = path.join(cDrivePath, 'SIA');
    const fileName = `${month}_${year}_transactions.csv`;
    let fileToOpen = fileName;

    const last30DaysBegin = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT + 1, 'days')
      .startOf('day');

    const last30DaysEnd = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT + 1, 'days')
      .endOf('day');

    const fileExists = fs.existsSync(path.join(urlPath, fileName));
    if (!fileExists) {
      const [previousYear, previousMonth] = last30DaysBegin.format('YYYY-MM-DD').split('-');
      const previousFileName = `${previousMonth}_${previousYear}_transactions.csv`;
      const previousFileExists = fs.existsSync(path.join(urlPath, previousFileName));
      if (previousFileExists) fileToOpen = previousFileName;
      else return res.status(200).json({ message: 'No transaction details file to edit yet.' });
    }

    const transactions = await Preview.aggregate([
      {
        $addFields: {
          jsDate: {
            $toDate: '$transactionDate'
          }
        }
      },
      {
        $match: {
          type: {
            $in: ['regular', 'void', 'refund', 'return']
          },
          jsDate: {
            $gte: new Date(last30DaysBegin),
            $lte: new Date(last30DaysEnd)
          },
          storeCode: settings[SettingsCategoryEnum.UnitConfig].storeCode
        }
      },
      {
        $sort: { createdAt: 1 }
      }
    ]);

    transactions.forEach((txn) => console.log(`Transaction is `, txn.transactionDate));
    const siNumbers = new Set(
      transactions.map((txn) => {
        return txn.data.cart.siNumber;
      })
    );

    const fileData = fs.createReadStream(path.join(urlPath, fileToOpen));
    const parseCsv = (fileData) => {
      return new Promise((resolve, reject) => {
        Papa.parse(fileData, {
          header: true,
          complete: (results) => {
            resolve(results.data);
          },
          error: (err) => {
            reject(err);
          }
        });
      });
    };

    const rows = await parseCsv(fileData);
    const updatedRows = rows.filter((row,) => {
      if (siNumbers.has(row['Order Num/Bill'])) return false;
      else return true;
    });

    fs.writeFileSync(
      path.join(urlPath, fileName),
      Papa.unparse(updatedRows, { header: true, delimiter: ',', quotes: true, quoteChar: '"' })
    );
    return res.status(200).json({ message: 'Successfully updated transactions csv file' });
  } catch (err) {
    console.log(err);
    next(new HttpError('Something went wrong.'));
  }
};

exports.updateTransactionDetails = async (req, res, next) => {
  try {
    const { settings, transactionDate } = req.body;
    const [year, month] = transactionDate.split('-');
    const last30DaysBegin = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT + 1, 'days')
      .startOf('day');

    const last30DaysEnd = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT + 1, 'days')
      .endOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

    const urlPath = path.join(cDrivePath, 'SIA');
    const fileName = `${month}_${year}_transactiondetails.csv`;
    let fileToOpen = fileName;

    const fileExists = fs.existsSync(path.join(urlPath, fileName));
    if (!fileExists) {
      const [previousYear, previousMonth] = last30DaysBegin
        .format('YYYY-MM-DD HH:mm:ss')
        .split(' ')[0]
        .split('-');
      const previousFileName = `${previousMonth}_${previousYear}_transactiondetails.csv`;
      const previousFileExists = fs.existsSync(path.join(urlPath, previousFileName));
      if (previousFileExists) fileToOpen = previousFileName;
      else return res.status(200).json({ message: 'No transaction details file to edit yet.' });
    }

    const transactions = await Preview.aggregate([
      {
        $addFields: {
          jsDate: {
            $toDate: '$transactionDate'
          }
        }
      },
      {
        $match: {
          type: {
            $in: ['regular', 'void', 'refund', 'return']
          },
          jsDate: {
            $gte: new Date(last30DaysBegin),
            $lte: new Date(last30DaysEnd)
          },
          storeCode: settings[SettingsCategoryEnum.UnitConfig].storeCode
        }
      },
      {
        $sort: { createdAt: 1 }
      }
    ]);

    const siNumbers = new Set(
      transactions.map((txn) => {
        return txn.data.cart.siNumber;
      })
    );

    const fileData = fs.createReadStream(path.join(urlPath, fileToOpen));
    const parseCsv = (fileData) => {
      return new Promise((resolve, reject) => {
        Papa.parse(fileData, {
          header: true,
          complete: (results) => {
            resolve(results.data);
          },
          error: (err) => {
            reject(err);
          }
        });
      });
    };

    const rows = await parseCsv(fileData);
    const updatedRows = await rows.filter((row) => {
      if (siNumbers.has(row['Order Num / Bill Num'])) return false;
      else return true;
    });

    fs.writeFileSync(
      path.join(urlPath, fileName),
      Papa.unparse(updatedRows, { header: true, delimiter: ',', quotes: true, quoteChar: '"' })
    );

    return res.status(200).json({ message: 'Successfully updated transactions csv file' });
  } catch (err) {
    console.log(err);
    next(new HttpError('Something went wrong.'));
  }
};

exports.regenerateTransactionsFile = async (req, res, next) => {
  try {
    const { transactionDate, settings } = req.body;
    const serialNumber =
      settings[SettingsCategoryEnum.UnitConfig].snMin?.split('/')?.[0].split(' ')?.[1] ?? '';
    const today = moment(transactionDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
    const last30Days = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT, 'days')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

    const [todayHour, todayMinute, todaySecond] = today.split(' ')[1].split(':');
    const [todayYear, todayMonth, todayDay] = transactionDate.split('-');
    const [previousHour, previousMinute, previousSecond] = last30Days.split(' ')[1].split(':');
    const [previousYear, previousMonth, previousDay] = last30Days.split(' ')[0].split('-');
    const startDate = new Date(
      Date.UTC(
        previousYear,
        previousMonth - 1,
        previousDay,
        previousHour,
        previousMinute,
        previousSecond,
        0
      )
    );
    const endDate = new Date(
      Date.UTC(todayYear, todayMonth - 1, todayDay, todayHour, todayMinute, todaySecond, 0)
    );

    const transactions = await Preview.aggregate([
      {
        $addFields: {
          jsDate: {
            $toDate: '$transactionDate'
          }
        }
      },
      {
        $match: {
          type: {
            $in: ['regular', 'void', 'refund']
          },
          jsDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $sort: { createdAt: 1 }
      }
    ]);

    let currentItemIndex = -1;
    const indexes = {};
    let csvRows = [];

    for (let i = 0; i < transactions.length; i++) {
      let cart = transactions[i].data.cart;

      const hasRMES = cart.payments.filter((payment) => payment.label === 'RMES');
      if (hasRMES?.length > 0) continue;
      let txnNumber = '';
      if (transactions[i].type === 'return') {
        txnNumber = cart.origTxnNumber;
      } else if (transactions[i].type === 'refund') {
        const transaction = await Transaction.find({
          storeCode: settings[SettingsCategoryEnum.UnitConfig].storeCode,
          siNumber: cart.newSiNumber.split('-')[0]
        });
        cart.siNumber = cart.newSiNumber;

        txnNumber = transaction[0].txnNumber;
      } else {
        txnNumber = cart.txnNumber;
      }

      const transactionAmounts = await TransactionAmount.find({
        storeCode: settings[SettingsCategoryEnum.UnitConfig].storeCode,
        txnNumber: txnNumber
      });

      let totalVatEx = 0;
      let totalSCD = 0;
      let totalPWD = 0;
      let totalVIP = 0;
      let totalEmployee = 0;
      let totalAthlete = 0;
      let totalTaxExempt =
        // eslint-disable-next-line
        parseFloat(transactionAmounts?.[0]?.vatExempt) +
        parseFloat(transactionAmounts?.[0]?.vatZeroRated) ?? 0;

      let allDiscounts = [];
      cart.confirmOrders[0].products.forEach((item) => {
        item.discounts?.forEach((discount) => {
          allDiscounts.push(discount);
        });
      });

      // Get SCD and PWD id numbers
      const scdIds = [];
      const pwdIds = [];

      // Get Total Discount amount from transaction discounts;
      const totalDiscounts = [
        ...(cart.discounts?.length > 0 ? cart.discounts : []),
        ...allDiscounts
      ].reduce((acc, discount) => {
        if (
          discount.label === 'VAT' ||
          discount.label === 'VAT EX' ||
          discount.label === 'VAT ZR'
        ) {
          totalVatEx = totalVatEx + discount.amount;
          return acc;
        } else if (discount.label === 'Senior Citizen (20%)') {
          totalSCD = totalSCD + discount.amount;
          totalTaxExempt -= discount.amount;
        } else if (discount.label === 'PWD (20%)') {
          totalPWD = totalPWD + discount.amount;
          totalTaxExempt -= discount.amount;
        } else if (discount.label === 'PNSTMD (20%)') {
          totalAthlete = totalAthlete + discount.amount;
        } else if (discount.label === 'Vip') {
          totalVIP = totalVIP + discount.amount;
        } else if (discount.label === 'Employee') {
          totalEmployee = totalEmployee + discount.amount;
        }

        return acc + discount.amount;
      }, 0);

      // Get other discounts
      let otherDiscounts = [];
      let otherDiscountsAmount = [];

      const discountNames = [...(cart.discounts?.length > 0 ? cart.discounts : []), ...allDiscounts]
        .filter((discount) => {
          if (
            [
              'VAT EX',
              'VAT',
              'Senior Citizen (20%)',
              'PWD (20%)',
              'Vip',
              'Employee',
              'PNSTMD (20%)',
              'VAT ZR'
            ].includes(discount.label)
          )
            return false;
          return true;
        })
        .reduce((prev, discount) => {
          let fieldName = '';
          let label = '';

          if (discount.prefix === 'PROMOCODE') {
            fieldName = discount.promoCodeId;
            label = `${discount.promoCodeId}=${discount.label}`;
          } else {
            fieldName = discount.label;
            label = `${discount.label}=${formatNumber(discount.amount)}`;
          }

          if (prev[`${fieldName}`]) {
            const prevTotal = prev[`${fieldName}`].total;
            if (discount.prefix !== 'PROMOCODE') {
              prev[`${fieldName}`].label = `${discount.label}=${prevTotal + discount.amount}`;
            }
            prev[`${fieldName}`].total += discount.amount;
            return prev;
          } else {
            return (prev = {
              ...prev,
              [`${fieldName}`]: {
                label,
                total: discount.amount
              }
            });
          }
        }, {});

      Object.keys(discountNames).forEach((discountName) => {
        otherDiscounts.push(discountNames[`${discountName}`].label);
        otherDiscountsAmount.push(formatNumber(discountNames[`${discountName}`].total));
      });

      const stringedTransactionDate = moment
        .utc(transactions[i].transactionDate)
        .format('YYYY-MM-DD HH:mm:ss');

      const row = {
        'Order Num/Bill': cart.siNumber,
        'Business Day': stringedTransactionDate.split(' ')[0],
        'Check Open': `${stringedTransactionDate.split(' ')[0]} ${cart.cartDate.split(' ')[1]}`,
        'Check Close': `${stringedTransactionDate.split(' ')[0]} ${cart.cartDate.split(' ')[1]}`,
        'Sales Type': settings[SettingsCategoryEnum.UnitConfig].smSalesType,
        'Transaction Type': settings[SettingsCategoryEnum.UnitConfig].smTransactionType,
        Void: transactions[i].type === 'void' ? 1 : 0,
        'Void Amount': transactions[i].type === 'void' ? formatNumber(cart.amounts.noPayment) : 0,
        Refund: transactions[i].type === 'refund' || transactions[i].type === 'return' ? 1 : 0,
        'Refund Amount':
          transactions[i].type === 'refund' || transactions[i].type === 'return'
            ? formatNumber((transactions[i].type === 'refund' ? -1 : 1) * cart.amounts.noPayment)
            : 0,
        'Guest Count': 1,
        'Guest Count (Senior)': scdIds.length,
        'Guest Count (PWD)': pwdIds.length,
        'Gross Sales Amount': ['void', 'return'].includes(transactions[i].type)
          ? '0.00'
          : parseFloat(
            (transactions[i].type === 'refund' ? -1 : 1) * cart.amounts.originalTotal
          ).toFixed(2),
        'Net Sales Amount': ['void', 'return'].includes(transactions[i].type)
          ? '0.00'
          : parseFloat(
            (transactions[i].type === 'refund' ? -1 : 1) *
            ((transactionAmounts[0].vatableSale ?? 0) + totalTaxExempt)
          ).toFixed(2),
        'Total Tax': ['void', 'return'].includes(transactions[i].type)
          ? '0.00'
          : parseFloat(
            (transactions[i].type === 'refund' ? -1 : 1) * (transactionAmounts[0].vat_amount ?? 0)
          ).toFixed(2),
        'Other/Local Tax': ['void', 'refund', 'return'].includes(transactions[i].type) ? 0 : 0,
        'Total Service Charge': ['void', 'refund', 'return'].includes(transactions[i].type) ? 0 : 0,
        'Total Tip': ['void', 'refund', 'return'].includes(transactions[i].type) ? 0 : 0,
        'Total Discount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalDiscounts),
        'Less Tax Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalVatEx),
        'Tax Exempt Sales': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalTaxExempt) ?? 0,
        'Regular/Other Discount Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : otherDiscounts,
        'Regular/Other Discount Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : otherDiscountsAmount.length === 0
            ? 0
            : otherDiscountsAmount.join('::'),
        'Employee Discount Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalEmployee),
        'Senior Citizen Discount Amount': ['void', 'refund', 'return'].includes(
          transactions[i].type
        )
          ? 0
          : formatNumber(totalSCD),
        'VIP Discount Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalVIP),
        'PWD Discount Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(totalPWD),
        'National Coach / Athlete /  Medal of Valor Discount amount': [
          'void',
          'refund',
          'return'
        ].includes(transactions[i].type)
          ? 0
          : formatNumber(totalAthlete),
        'SMAC Discount': ['void', 'refund', 'return'].includes(transactions[i].type) ? 0 : 0,
        'Online Deals Discount Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Online Deals Discount Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 1 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 2 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 3 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 4 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 5 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 6 Name': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : '',
        'Discount Field 1 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 2 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 3 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 4 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 5 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Discount Field 6 Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Payment Type_1': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : cart.payments[0]?.label ?? '',
        'Payment Amount_1': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(cart.payments[0]?.amount ?? 0),
        'Payment Type_2': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : cart.payments[1]?.label ?? '',
        'Payment Amount_2': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(cart.payments[1]?.amount ?? 0),
        'Payment Type_3': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? ''
          : cart.payments[2]?.label ?? '',
        'Payment Amount_3': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(cart.payments[2]?.amount ?? 0),
        'Total Cash Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(
            cart.payments.reduce(
              (acc, payment) => (acc += payment.value === 'cash' ? payment.amount : 0),
              0
            )
          ),
        'Total Gift Cheque / Gift Card Sales Amount': ['void', 'refund', 'return'].includes(
          transactions[i].type
        )
          ? 0
          : formatNumber(
            cart.payments.reduce(
              (acc, payment) => (acc += payment.value === 'giftCard' ? payment.amount : 0),
              0
            )
          ),
        'Total Debit Card Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(
            cart.payments.reduce(
              (acc, payment) =>
              (acc +=
                payment.value === 'card' && payment.cardType === 'debit-card'
                  ? payment.amount
                  : 0),
              0
            )
          ),
        'Total E-wallet / Online Sales Amount': ['void', 'refund', 'return'].includes(
          transactions[i].type
        )
          ? 0
          : formatNumber(
            cart.payments.reduce(
              (acc, payment) => (acc += payment.value === 'eWallet' ? payment.amount : 0),
              0
            )
          ),
        'Total Other Tender Sales Amount': 0,
        'Total Mastercard Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : formatNumber(
            cart.payments.reduce(
              (acc, payment) =>
              (acc +=
                payment.value === 'card' && payment.cardType === 'credit-card'
                  ? payment.amount
                  : 0),
              0
            )
          ),
        'Total Visa Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Total American Express Sales Amount': ['void', 'refund', 'return'].includes(
          transactions[i].type
        )
          ? 0
          : 0,
        'Total Diners Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Total JCB Sales Amount': ['void', 'refund', 'return'].includes(transactions[i].type)
          ? 0
          : 0,
        'Total Other Credit Card Sales Amount': ['void', 'refund', 'return'].includes(
          transactions[i].type
        )
          ? 0
          : 0,
        'Terminal Number': settings[SettingsCategoryEnum.UnitConfig].terminalNumber,
        'Serial Number': serialNumber.trim()
      };

      currentItemIndex += 1;
      indexes[`${transactions[i].data.cart.siNumber}`] = currentItemIndex;

      csvRows.push(row);
    }

    const urlPath = path.join(cDrivePath, 'SIA');
    const [year, month] = transactionDate.split('-');
    const fileName = `${month}_${year}_transactions.csv`;

    fs.writeFileSync(
      path.join(urlPath, fileName),
      Papa.unparse(csvRows, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
    );
    res.status(200).json({ message: 'Test' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong on saving the transaction files.');
    next(error);
  }
};

exports.regenerateTransactionDetailsFile = async (req, res, next) => {
  try {
    const { transactionDate } = req.body;
    const today = moment(transactionDate).endOf('day').format('YYYY-MM-DD HH:mm:ss');
    const last30Days = moment(transactionDate)
      .subtract(DAYS_TO_SUBTRACT, 'days')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss');

    const [todayHour, todayMinute, todaySecond] = today.split(' ')[1].split(':');
    const [todayYear, todayMonth, todayDay] = transactionDate.split('-');
    const [previousHour, previousMinute, previousSecond] = last30Days.split(' ')[1].split(':');
    const [previousYear, previousMonth, previousDay] = last30Days.split(' ')[0].split('-');
    const startDate = new Date(
      Date.UTC(
        previousYear,
        previousMonth - 1,
        previousDay,
        previousHour,
        previousMinute,
        previousSecond,
        0
      )
    );
    const endDate = new Date(
      Date.UTC(todayYear, todayMonth - 1, todayDay, todayHour, todayMinute, todaySecond, 0)
    );

    const transactions = await Preview.aggregate([
      {
        $addFields: {
          jsDate: {
            $toDate: '$transactionDate'
          }
        }
      },
      {
        $match: {
          type: {
            $in: ['regular', 'void', 'refund']
          },
          jsDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $sort: { createdAt: 1 }
      }
    ]);

    let currentItemIndex = -1;
    const indexes = {};
    let csvRows = [];
    transactions.forEach((txn, index) => {
      let cart = txn.data.cart;

      const hasRMES = cart.payments.filter((payment) => payment.label === 'RMES');
      if (hasRMES?.length > 0) return;

      let transactionDiscounts = [];
      if (cart.discounts) {
        cart.discounts.forEach((discount) => {
          if (discount.label === 'VAT EX' || discount.label === 'VAT ZR') return;

          const singleDiscount = {
            ...discount,
            amount: discount.amount / cart.confirmOrders[0].products.length
          };
          transactionDiscounts.push(singleDiscount);
        });
      }

      if (transactions[index].type === 'refund') {
        cart.siNumber = cart.newSiNumber;
      }

      const items = cart.confirmOrders[0]?.products;
      const rows = items.map((item, itemIndex) => {
        if (txn.type !== 'void') {
          currentItemIndex += 1;
          if (itemIndex === 0) indexes[`${txn.data.cart.siNumber}`] = currentItemIndex;
        }

        return {
          'Order Num / Bill Num': cart.siNumber,
          'Item ID': item.productCode,
          'Item Name': item.productName,
          'Item Category': item.categoryName,
          'Item Quantity': item.quantity,
          'Transaction Item Price':
            txn.type === 'regular'
              ? formatNumber(
                item.price -
                [
                  ...(item.discounts?.length > 0 ? item.discounts : []),
                  ...transactionDiscounts
                ]
                  .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
                  .reduce((acc, curr) => acc + curr.amount, 0)
              )
              : 0,
          'Menu Item Price': formatNumber(item.price),
          'Discount Code':
            txn.type === 'regular'
              ? [...(item.discounts?.length > 0 ? item.discounts : []), ...transactionDiscounts]
                .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
                .map((discount) => discount.label)
                .join('::')
              : '',
          'Discount Amount':
            txn.type === 'regular'
              ? formatNumber(
                [...(item.discounts?.length > 0 ? item.discounts : []), ...transactionDiscounts]
                  .filter((discount) => !['VAT', 'VAT EX', 'VAT ZR'].includes(discount.label))
                  .reduce((acc, curr) => acc + curr.amount, 0)
              )
              : 0,
          'Modifier (1) Name': '',
          'Modifier (1) Quantity': 0,
          'Modifier (2) Name': '',
          'Modifier (2) Quantity': 0,
          Void: txn.type === 'void' ? 1 : 0,
          'Void Amount':
            txn.type === 'void'
              ? formatNumber(
                item.price -
                [
                  ...(item.discounts?.length > 0 ? item.discounts : []),
                  ...transactionDiscounts
                ].reduce((acc, curr) => acc + curr.amount, 0)
              )
              : 0,
          Refund: txn.type === 'refund' || txn.type === 'return' ? 1 : 0,
          'Refund Amount':
            txn.type === 'refund' || txn.type === 'return'
              ? formatNumber(
                item.price -
                [
                  ...(item.discounts?.length > 0 ? item.discounts : []),
                  ...transactionDiscounts
                ].reduce((acc, curr) => acc + curr.amount, 0)
              )
              : 0
        };
      });

      csvRows = [...csvRows, ...rows];
    });

    const urlPath = path.join(cDrivePath, 'SIA');
    const [year, month] = transactionDate.split('-');
    const fileName = `${month}_${year}_transactiondetails.csv`;

    fs.writeFileSync(
      path.join(urlPath, fileName),
      Papa.unparse(csvRows, { header: true, quotes: true, delimiter: ',', quoteChar: '"' })
    );
    return res.status(200).json({ message: 'Test' });
  } catch (err) {
    console.log(err);
    const error = new HttpError('Something went wrong on saving the transaction files.');
    next(error);
  }
};

function formatNumber(number) {
  if (Number.isInteger(number)) {
    return number;
  }

  return parseFloat(number).toFixed(2);
}
