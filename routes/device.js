const express = require('express');
const controller = require('../controllers/device');
const router = express.Router();

router.get('/hardware-ids', controller.getAllHardwareIds);

module.exports = router;
