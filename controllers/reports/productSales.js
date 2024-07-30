const Excel = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');

const documentsDir = path.join(os.homedir(), 'Documents')

exports.exportExcel = async (req, res, next) => {
  const { filteredOrders, searchValues } = req.body;

  const { from, to } = searchValues;

  const rows = [];

  filteredOrders.forEach((item) => {
    rows.push({
      sku: item.productCode,
      itemDescription: item.productName,
      totalOrders: item.countOrders,
      totalSales: roundUpAmount(item.totalAmount)
    });
  });

  const workbook = new Excel.Workbook();
  const worksheet = workbook.addWorksheet(`Product Sales | ${from} - ${to}`);

  worksheet.columns = [
    { key: 'sku', header: 'SKU' },
    { key: 'itemDescription', header: 'Item Description' },
    { key: 'totalOrders', header: 'Total Orders' },
    { key: 'totalSales', header: 'Total Sales' }
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

  const urlPath = `${documentsDir}/UMBRA_POS_REPORTS/PRODUCT_SALES/`;
  !fs.existsSync(urlPath) && fs.mkdirSync(urlPath, { recursive: true });

  const exportPath = path.resolve(urlPath, `Product Sales Report.xlsx`);

  await workbook.xlsx.writeFile(exportPath);

  res.status(200).json({ data: 'ok' });
};

const roundUpAmount = (num) => {
  // num = Math.round(num * 100) / 100;
  num = Number(num);
  num = Number(num) !== 0 ? Number(num.toFixed(3)).toFixed(2) : '0.00';

  return num;
};
