const express = require('express');
const controller = require('../controllers/promoCode');
const { createPromoValidator } = require('../validators/promo-codes/promoCodeValidator');
const { batchCreatePromoMiddleware } = require('../middleware/promo-codes/promo-code');
const router = express.Router();

router.get('/', controller.getAllPromoCodes);

router.post('/', createPromoValidator, controller.createPromoCode);
router.post('/batch', batchCreatePromoMiddleware, controller.batchCreatePromoCode);

router.delete('/:promoId', controller.deletePromoCode);

module.exports = router;
