
"use strict";

const express = require("express");
const router = express.Router();

const {
  getStock,
  getConsumptions,
  issueStock,
} = require("../controllers/consumptionController");

const {
  requireAuth,
  allowRoles,
} = require("../middleware/auth");

// Stock is viewable by all three roles.
router.get(
  "/stock",
  requireAuth,
  allowRoles("Admin", "HR", "Staff"),
  getStock
);

// Staff can view their own consumption records.
// Admin and HR can view all consumption records.
router.get(
  "/",
  requireAuth,
  allowRoles("Admin", "HR", "Staff"),
  getConsumptions
);

// Only Admin and HR can issue stock.
router.post(
  "/",
  requireAuth,
  allowRoles("Admin", "HR"),
  issueStock
);

module.exports = router;
