const express = require('express');
const router = express.Router();

const controller = require('../controllers/script');

// fix price override
router.get('/price-override/incorrect/:transactionDate', controller.getIncorrectData);

module.exports = router;
