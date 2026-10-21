
"use strict";

const express = require("express");
const router = express.Router();

const { getAuditLogs } = require("../controllers/auditLogsController");
const { requireAuth, allowRoles } = require("../middleware/auth");

// Audit Logs are restricted to Admin.
router.use(requireAuth, allowRoles("Admin"));

router.get("/", getAuditLogs);

module.exports = router;
