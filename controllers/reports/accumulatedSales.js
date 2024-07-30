const Preview = require('../../models/Preview');
const Excel = require('exceljs');
const path = require('path');
const { format } = require('date-fns');
const fs = require('fs');
const { simplePaginate } = require('../../services/simplePaginate');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.getAccumulatedSales = async (req, res, next) => {
  const { storeCode } = req.params;
  const {
    page = 1,
    pageSize = 5,
  } = req.query;

  try {

    let query = {storeCode, type: 'z-read'};

    const { paginationMeta, limit, skip } = await simplePaginate(
      Preview,
      { page, pageSize },
      query
    );

    const previews = await Preview.find(query)
      .limit(limit)
      .skip(skip)
      .sort({ transactionDate: -1 })
      .maxTimeMS(300000);

    return res.status(200).json({
      meta: paginationMeta,
      data: previews
    });

  } catch (err) {
     return res.status(400).json({ message: err.message });
  }
};

exports.exportExcel = async (req, res, next) => {
  const { transactions } = req.body;

  const rows = [];

  transactions.forEach((node) => {
    const { zReadData } = node.data;

    rows.push({
      date: fDateTimeSuffix(node.transactionDate).split(' ')[0],
      beginningSi: getSiNumbers(zReadData, 'from'),
      endingSi: getSiNumbers(zReadData, 'to'),
      grandBeginning: roundUpAmount(zReadData.ACCUMULATED_SALES.old),
      grandEnding: roundUpAmount(zReadData.ACCUMULATED_SALES.new),
      salesCount: zReadData.cashierAudit.NUM_SALES_TXN.toString(),
      grossSales: roundUpAmount(zReadData.SALES.gross),
      vatableSales: roundUpAmount(getVatableSales(zReadData)),
      vatAmount: roundUpAmount(getVatAmount(zReadData)),
      vatExempt: roundUpAmount(getVatExemptSales(zReadData)),
      zeroRated: roundUpAmount(getVatZeroRated(zReadData)),
      regularDiscount: roundUpAmount(getRegularDiscount(zReadData)),
      specialDiscount: roundUpAmount(getSpecialDiscount(zReadData)),
      voidCount: zReadData.cashierAudit.NUM_VOID_TXN.toString(),
      voidAmount: roundUpAmount(getVoided(zReadData)),
      returnCount: zReadData.payments.nonCash.returns.RMES_ISSUANCE.count.toString(),
      returnAmount: roundUpAmount(getReturned(zReadData)),
      totalDeductions: roundUpAmount(getTotalDiscount(zReadData)),
      vatSpecialDiscount: '0.00',
      others: '0.00',
      totalVatAdj: '0.00',
      vatPayable: roundUpAmount(getVatAmount(zReadData)),
      netSales: roundUpAmount(getNetSales(zReadData)),
      otherIncome: '0.00',
      salesOverrun: roundUpAmount(getSalesOverrun(zReadData)),
      totalNetSales: roundUpAmount(getTotalNetSales(zReadData)),
      remarks: ''
    });
  });

  const workbook = new Excel.Workbook();
  const worksheet = workbook.addWorksheet('Accumulated Sales');

  worksheet.columns = [
    { key: 'date', header: 'Date' },
    { key: 'beginningSi', header: 'Beginning SI No.' },
    { key: 'endingSi', header: 'Ending SI No.' },
    { key: 'grandBeginning', header: 'Grand Accum. Sales Beginning Balance' },
    { key: 'grandEnding', header: 'Grand Accum. Sales Ending Balance' },
    { key: 'salesCount', header: 'Sales Count' },
    { key: 'grossSales', header: 'Gross Sales From POS' },
    { key: 'vatableSales', header: 'VATable Sales' },
    { key: 'vatAmount', header: 'VAT Amount' },
    { key: 'vatExempt', header: 'VAT-Exempt Sales' },
    { key: 'zeroRated', header: 'Zero Rated Sales' },
    { key: 'regularDiscount', header: 'Regular Discount' },
    { key: 'specialDiscount', header: 'Special Discount (SC/PWD)' },
    { key: 'voidCount', header: 'Void Count' },
    { key: 'voidAmount', header: 'Voided' },
    { key: 'returnCount', header: 'Return Count' },
    { key: 'returnAmount', header: 'Returned' },
    { key: 'totalDeductions', header: 'Total Deductions' },
    { key: 'vatSpecialDiscount', header: 'VAT on Special Discount' },
    { key: 'others', header: 'Others' },
    { key: 'totalVatAdj', header: 'Total VAT Adj.' },
    { key: 'vatPayable', header: 'VAT Payable' },
    { key: 'netSales', header: 'Net Sales' },
    { key: 'otherIncome', header: 'Other Income' },
    { key: 'salesOverrun', header: 'Sales Overrun/Overflow' },
    { key: 'totalNetSales', header: 'Total Net Sales' },
    { key: 'remarks', header: 'Remarks' }
  ];

  worksheet.columns.forEach((sheetColumn) => {
    sheetColumn.font = {
      size: 11
    };
    sheetColumn.width = 40;
  });

  worksheet.getRow(1).font = {
    bold: true,
    size: 11
  };

  rows.forEach((item) => {
    worksheet.addRow(item);
  });

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/ACCUMULATED_SALES/`;
  !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

  const exportPath = path.resolve(urlPath, 'Accumulated Sales-Backend Report.xlsx');

  await workbook.xlsx.writeFile(exportPath);

  res.status(200).json({ data: 'ok' });
};

const roundUpAmount = (num) => {
  // num = Math.round(num * 100) / 100;
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};

const getSiNumbers = (zReadData, type) => {
  const { from, to } = zReadData.SI_NUM;
  return type === 'from' ? from : to;
};

const getVatableSales = (zReadData) => {
  return zReadData.isNonVat
    ? 0
    : zReadData.vat.VAT_DETAILS.vatableSales;
};

const getVatAmount = (zReadData) => {
  return zReadData.isNonVat
    ? 0
    : zReadData.vat.VAT_DETAILS.vatAmount;
};

const getVatExemptSales = (zReadData) => {
  return zReadData.isNonVat
    ? 0
    : zReadData.vat.VAT_DETAILS.vatExemptSales;
};

const getVatZeroRated = (zReadData) => {
  return zReadData.isNonVat
    ? 0
    : zReadData.vat.VAT_DETAILS.vatZeroRated;
};

const getRegularDiscount = (zReadData) => {
  return zReadData.discounts.REGULAR_DISCOUNTS.total;
};

const getSpecialDiscount = (zReadData) => {
  return zReadData.discounts.SPECIAL_DISCOUNTS.total;
};

const getVoided = (zReadData) => {
  const cancelledAmount = zReadData.cashierAudit.VOID_TXN_AMOUNT;

  return cancelledAmount;
};

const getReturned = (zReadData) => {
  const returnedAmount = Math.abs(
    zReadData.payments.nonCash.returns.RMES_ISSUANCE.amount
  );

  if(!isNaN(returnedAmount)){
    return returnedAmount
  }

  return "0.00";
};

const getTotalDiscount = (zReadData) => {
  const totalDiscount =
    getRegularDiscount(zReadData) +
    getSpecialDiscount(zReadData) +
    getVoided(zReadData) +
    getReturned(zReadData);

  return totalDiscount;
};

const getNetSales = (zReadData) => {
  return zReadData.SALES.net;
};

const getSalesOverrun = (zReadData) => {
  const salesOverrun = zReadData.OVER_SHORT;

  return salesOverrun > 0 ? salesOverrun : 0;
};

const getTotalNetSales = (zReadData) => {
  const t = Number(getNetSales(zReadData)) + Number(getSalesOverrun(zReadData));

  return t;
};

const fDateTimeSuffix = (date) => {
  return format(new Date(date), 'MM/dd/yyyy hh:mm a');
};
