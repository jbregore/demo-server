const express = require('express');
const controller = require('../controllers/login');
const router = express.Router();

router.post('/', controller.login);
router.post('/logs', controller.createLoginLogs);
router.get('/check-xread', controller.checkIsXRead);
router.get('/logs/:employeeId/:transactionDate', controller.getLoginLogsById);

module.exports = router;
