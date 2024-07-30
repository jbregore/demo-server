const express = require('express');
const router = express.Router();

const initialCash = require('../controllers/reports/initialCash');
const cashTakeout = require('../controllers/reports/cashTakeout');
const xRead = require('../controllers/reports/xRead');
const zRead = require('../controllers/reports/zRead');
const transaction = require('../controllers/reports/transaction');
const preview = require('../controllers/reports/preview');
const drawer = require('../controllers/reports/drawer');
const voidedSales = require('../controllers/reports/voidedSales');
const refundedSales = require('../controllers/reports/refundedSales');
const returnExchange = require('../controllers/reports/returnExchange');
const productSales = require('../controllers/reports/productSales');
const accumulatedSales = require('../controllers/reports/accumulatedSales');
const journal = require('../controllers/reports/journal');
const scPwdReports = require('../controllers/reports/scPwdReports');
const resetCount = require('../controllers/reports/resetCount');
const supervisorAccess = require('../controllers/reports/supervisorAccess');
const periodicalZread = require('../controllers/reports/periodicalZread');
const cashierSales = require('../controllers/reports/cashierSales');
const cashier = require('../controllers/reports/cashier');
const sp = require('../controllers/reports/sp');

const discounts = require('../controllers/reports/discountReports');

// open drawer
router.post('/open-drawer', drawer.openCashDrawer);
// initial cash
router.post('/initial/', initialCash.createInitialCash);
router.post('/initial/print', initialCash.printInitialCash);
router.get('/initial/:branchCode', initialCash.getInitialCashByBranchCode);
router.get('/initial/for-today/:branchCode', initialCash.getInitialCashForToday);
router.get('/initial/user-logs-today/:employeeId', initialCash.getUserInitialCashForToday);
router.get('/initial/user-log/:employeeId/:posDate', initialCash.getInitialCashByUser);
// cash takeout
router.post('/takeout', cashTakeout.createCashTakeout);
router.post('/takeout/print', cashTakeout.printCashTakeout);
router.get(
  '/takeout/check/:employeeId/:storeCode/:transactionDate',
  cashTakeout.checkExistingCashTakeout
);
router.get('/takeout/check-range', cashTakeout.checkPreviewsRange);
router.get('/takeout/download', cashTakeout.downloadEodCashReport);
// x read
router.post('/read/logs', xRead.createReadLog);
router.get('/x-read/:transactionDate/:employeeId/:storeCode/:timeFrom/:timeTo', xRead.getXReadData);
router.post('/x-read/print', xRead.printXRead);
router.post('/x-read/generate', xRead.generateXRead);
// z read
router.get('/z-read/:storeCode/:transactionDate', zRead.getZReadData);
router.post('/z-read/print', zRead.printZRead);
router.post('/z-read/generate', zRead.generateZRead);
// transaction
router.post('/pos-transaction', transaction.createPosTransaction);
// preview
router.post('/preview', preview.createPreview);
router.get('/preview/all/:storeCode', preview.getPreviewByStoreCode);
router.get('/preview/:txnNumber', preview.getOnePreview);
// voided sales
router.get('/voided-sales/:storeCode', voidedSales.getVoidedSalesByStoreCode);
// refunded sales
router.get('/refunded-sales/:storeCode', refundedSales.getRefundedSalesByStoreCode);
// return sales
router.get('/return-exchange/:storeCode', returnExchange.getReturnExchangeByStoreCode);
// discounts
router.get('/discounts/:storeCode', discounts.getDiscountsReports);
// accumulated sales
router.get('/accumulated-sales/:storeCode', accumulatedSales.getAccumulatedSales);
router.post('/accumulated-sales/export-excel', accumulatedSales.exportExcel);
// product sales
router.post('/product-sales/export-excel', productSales.exportExcel);
// journal
router.get('/journal/:transactionDate/:storeCode', journal.getTransactions);
router.post('/journal/upload', journal.uploadJournal);
router.get('/journal/download', journal.downloadJournal);
router.get('/journal/download-accumulated', journal.downloadAccumulated);
router.get('/journal/download-product-sales', journal.downloadProductSales);
// sc or pwd reports
router.get('/sc-pwd-reports/:storeCode', scPwdReports.getScPwdReports);
router.get(
  '/sc-pwd-reports/date-filter/:storeCode/:dateFilter',
  scPwdReports.getDateFilterScPwdReports
);
// reset count
router.get('/reset-count/:storeCode', resetCount.getResetCount);
router.post('/reset-count', resetCount.createResetCountLog);
// supervisor access
router.post('/supervisor-access', supervisorAccess.checkSupervisorAccess);
// prediocal zread
router.get(
  '/periodical-zread/:fromTransactionDate/:toTransactionDate/:storeCode',
  periodicalZread.getPeriodZreadTransactions
);
router.post('/periodical-zread/print-receipt', periodicalZread.printPeriodicalZread);
// custom cashier sales report
router.get('/cashier-sales/get-cashiers/:transactionDate/:branchCode', cashierSales.getCashiers);
router.get(
  '/cashier-sales/:transactionDate/:employeeId/:branchCode/:timeFrom/:timeTo',
  cashierSales.getCashierSales
);
// cashiers
router.get('/cashier/online/:branchCode/:transactionDate', cashier.getOnlineCashiers);
// sl
router.post('/sp/sl', sp.createSl);
router.post('/sp/sl/all', sp.createSlAll);
router.get('/sp/sl/:transactionDate', sp.getSlReport);
router.get('/sp/sl/download/:transactionDate', sp.downloadSl);
// cl
router.get('/sp/cl/download/:transactionDate', sp.downloadCl);




module.exports = router;
