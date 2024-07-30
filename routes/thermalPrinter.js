const express = require('express');

const controller = require('../controllers/thermalPrinter');

const router = express.Router();

router.post('/', controller.printReceipt);

module.exports = router;
