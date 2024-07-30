const express = require('express');
const controller = require('../controllers/loyalty');
const router = express.Router();

router.get('/customer', controller.getCustomerById);
router.patch('/customer', controller.updateCustomerPoints);

module.exports = router;
