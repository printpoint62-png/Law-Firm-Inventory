
"use strict";

const express = require("express");
const router = express.Router();

const {
  getUnits,
  createUnit,
  updateUnit,
  updateUnitStatus,
} = require("../controllers/unitsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

router.use(requireAuth, allowRoles("Admin"));

router.get("/", getUnits);
router.post("/", createUnit);
router.put("/:id", updateUnit);
router.patch("/:id/status", updateUnitStatus);

module.exports = router;
