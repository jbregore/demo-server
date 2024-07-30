const express = require('express');
const controller = require('../controllers/transaction');

const router = express.Router();

router.get('/filtered/:storeCode', controller.getFilteredTransactions);
router.patch('/status', controller.updateOrderStatus);

// Printing
router.post('/void/receipt', controller.printVoidReceipt);
router.post('/refund/receipt', controller.printRefundReceipt);
router.post('/return/receipt', controller.printReturnReceipt);

// Old Routes
router.patch('/status/cancel', controller.updateStatusToCancelled);
router.get('/return/item', controller.getReturnedItem);

module.exports = router;
