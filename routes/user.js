const express = require("express");
const { check } = require("express-validator");

const controller = require("../controllers/user");
const router = express.Router();

// create new user
router.post(
  "/",
  [
    check("employeeId").notEmpty(),
    check("firstName").notEmpty(),
    check("middleName").notEmpty(),
    check("lastName").notEmpty(),
    check("role")
      .notEmpty()
      .isIn(["admin", "manager", "supervisor", "cashier"]),
    check("contactNumber").notEmpty(),
    check("username").notEmpty(),
    check("password").notEmpty(),
    check("isAdmin").isBoolean(),
  ],
  controller.createEmployee
);

// edit employee
router.patch(
  "/:id",
  [
    check("employeeId").notEmpty(),
    check("firstName").notEmpty(),
    check("middleName").notEmpty(),
    check("lastName").notEmpty(),
    check("role")
      .notEmpty()
      .isIn(["admin", "manager", "supervisor", "cashier"]),
    check("contactNumber").notEmpty(),
    check("username").notEmpty(),
    check("isAdmin").isBoolean(),
  ],
  controller.updateEmployee
);

// archive employee
router.patch(
  "/archive/:id",
  [check("isArchive").isBoolean()],
  controller.archiveEmployee
);

// get all employee
router.get("/", controller.getAllEmployee);

module.exports = router;
