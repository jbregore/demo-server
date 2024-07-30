const express = require("express");
const controller = require("../controllers/sales");
const router = express.Router();

router.get("/overall-sales/:branchCode", controller.getOverallTotalSales);
router.get("/overall-orders/:branchCode", controller.getOverallTotalOrders);
router.get(
  "/today-sales/:branchCode/:transactionDate",
  controller.getTodayTotalSales
);
router.get(
  "/today-orders/:branchCode/:transactionDate",
  controller.getTodayTotalOrders
);

router.get("/products/:storeCode", controller.getProductsSales);
router.get(
  "/product-sales/:productCode/:branchCode",
  controller.getTotalSalesByProduct
);

router.get("/payment-reports/:branchCode", controller.getPaymentReports);

router.post("/sales-reports/send", controller.sendSalesReport);
router.post("/grand-accumulated-report/enqueue", controller.enqueueGrandAccumulatedReport);
router.post("/reports-queue/upload", controller.uploadReportsQueue);

module.exports = router;
