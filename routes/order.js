const express = require('express');
const controller = require('../controllers/order');
const router = express.Router();

router.post('/', controller.createOrder);
router.put('/add-order-item', controller.addOrderItem);

// Get
router.get(
  '/order/for-payment/:transactionDate',
  controller.getForPaymentOrders
);
router.get('/promo-codes', controller.getPromoCodes);

//Checkout
router.post('/checkout', controller.checkout);

// Create 
router.post('/pos-transaction', controller.createPosTransaction);
router.post('/pos-sc-pwd-report', controller.createPosScPwdReport);
router.post('/pos-discount/item', controller.createPosDiscountItemLog);
router.post('/pos-discount/order', controller.createPosDiscountOrderLog);
router.post('/pos-discount/transaction', controller.createPosDiscountTransactionLog);
router.post('/promo-code/logs', controller.createPromoCodeLogs);
router.post('/pos-payment', controller.createPosPaymentLog);
router.post('/pos-txn-amount', controller.createPosTxnAmount);


// Update
router.patch('/paid', controller.updateOrderPaid);
router.patch('/suspend', controller.updateOrderSuspend);
router.patch('/product/cancel', controller.updateProductCancelled)

// Old 
router.get('/product/free-item/:table', controller.getProductsByFreeItem);

//
router.patch('/pos-loyalty-points/update-points', controller.updateLoyaltyPoints);

module.exports = router;
