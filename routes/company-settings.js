const express = require('express');
const router = express.Router();
const companySettings = require('../controllers/company-settings');

router.get('/', companySettings.get);
router.patch('/', companySettings.update);

module.exports = router;
