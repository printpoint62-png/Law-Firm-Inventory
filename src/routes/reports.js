
"use strict";

const express = require("express");
const router = express.Router();

const {
  getReports,
  exportReportsCsv,
} = require("../controllers/reportsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

router.get(
  "/",
  requireAuth,
  allowRoles("Admin", "HR", "Staff"),
  getReports
);

router.get(
  "/export.csv",
  requireAuth,
  allowRoles("Admin", "HR", "Staff"),
  exportReportsCsv
);

module.exports = router;
