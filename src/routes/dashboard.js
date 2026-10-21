
"use strict";

const express = require("express");
const router = express.Router();

const { getDashboardStats } = require("../controllers/dashboardController");
const { requireAuth, allowRoles } = require("../middleware/auth");

router.get(
  "/stats",
  requireAuth,
  allowRoles("Admin", "HR"),
  getDashboardStats
);

module.exports = router;
