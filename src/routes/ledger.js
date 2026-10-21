
"use strict";

const express = require("express");
const router = express.Router();

const { getLedger } = require("../controllers/ledgerController");
const { requireAuth, allowRoles } = require("../middleware/auth");

router.get(
  "/",
  requireAuth,
  allowRoles("Admin", "HR", "Staff"),
  getLedger
);

module.exports = router;
