const express = require('express');
const router = express.Router();

const mwc = require('../controllers/accreditation/mwc');
const robinson = require('../controllers/accreditation/robinson');
const robinsonLogs = require('../controllers/accreditation/robinsonLogs');
const sm = require('../controllers/accreditation/sm');
const ayala = require('../controllers/accreditation/ayala');
const icm = require('../controllers/accreditation/icm')
const evia = require('../controllers/accreditation/evia')
const araneta = require('../controllers/accreditation/araneta')

// megaworld
router.get('/mwc/daily-sales-data/:storeCode/:transactionDate', mwc.getDailySalesData);

// robinson
router.get('/robinson/daily-sales-data/:storeCode/:transactionDate', robinson.getDailySalesData);
router.post('/robinson/logs', robinsonLogs.createLogs);
router.post('/robinson/sendFile', robinson.sendRobinsonsFile);
router.post('/robinson/resendFile', robinson.resendRobinsonsFile);
router.get('/robinson/sentFiles/:transactionDate', robinson.getSentFiles);
router.post('/robinson/resendExistingFile', robinson.resendExistingRLCFile);
router.post('/robinson/sendBatchFiles', robinson.sendBatchFiles);
router.get('/robinson/resend', robinson.autoResendUnsentFiles);

router.get('/robinson/logs/:storeCode/:transactionDate', robinsonLogs.getLogsByStoreCode);
router.patch('/robinson/batch-counter/:storeCode/:transactionDate', robinsonLogs.updateBatchNumber);
router.patch('/robinson/reprint/:storeCode/:transactionDate', robinsonLogs.saveReprint);

// sm
router.post('/sm/save-transaction-details', sm.saveTransactionDetails);
router.post('/sm/save-transaction', sm.saveTransaction);
router.put('/sm/update-transaction-details', sm.updateTransactionDetails);
router.put('/sm/update-transaction', sm.updateTransactions);
router.post('/sm/generate-transaction', sm.regenerateTransactionsFile);
router.post('/sm/generate-transaction-details', sm.regenerateTransactionDetailsFile);

// ayala
router.post('/ayala/z-report', ayala.getZReadReport);
router.post('/ayala/hourly-sales-data', ayala.getHourlySalesData);
router.post('/ayala/daily-sales-data', ayala.getDailySalesData);
router.post('/ayala/new-daily-sales-data', ayala.getNewDailySalesData);
router.post('/ayala/new-hourly-sales-data', ayala.getNewHourlySalesData);
router.post('/ayala/resend/new-hourly-sales-data', ayala.resendHourlySalesFile);
router.post('/ayala/regenerate/new-hourly-sales-data', ayala.regeneratePerTransactionFilesStacked);
router.get('/ayala/txnNumbers', ayala.getTransactionNumbers)

// icm
router.post('/icm/daily-sales', icm.saveDailySales)
router.post('/icm/hourly-sales', icm.saveHourlySales)

//evia
router.post('/evia', evia.createDailySalesFile)

// araneta
router.post('/araneta', araneta.createDailySalesReport)
router.post('/araneta/z-read', araneta.createZReadReport)
router.post('/araneta/regenerate-daily', araneta.regenerateDailySalesReport)

module.exports = router;