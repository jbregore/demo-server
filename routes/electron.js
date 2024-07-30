const express = require("express");
const controller = require("../controllers/electron");
const router = express.Router();

router.get("/version", controller.getAppVersion);
router.get("/release/:assetId/download", controller.downloadRelease);

module.exports = router;
