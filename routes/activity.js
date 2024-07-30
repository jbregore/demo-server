const express = require('express');
const controller = require('../controllers/activity');
const router = express.Router();

router.get('/filtered/:storeCode', controller.getFilteredUserActivityLogs);
router.post('/', controller.createUserActivityLog);

module.exports = router;
