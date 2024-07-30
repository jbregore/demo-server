const express = require("express");
const { check } = require("express-validator");

const controller = require("../controllers/auth");

const router = express.Router();

// login
router.post(
  "/",
  [
    check("username").notEmpty(),
    check("password").notEmpty(),
    check("storeCode").notEmpty(),
    check("posDate").notEmpty(),
  ],
  controller.authenticateUser
);
router.post("/logs", controller.createLogs);

module.exports = router;
