
"use strict";

const express = require("express");
const router = express.Router();

const {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  updateVendorStatus,
} = require("../controllers/vendorsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

router.use(requireAuth, allowRoles("Admin"));

router.get("/", getVendors);
router.get("/:id", getVendorById);
router.post("/", createVendor);
router.put("/:id", updateVendor);
router.patch("/:id/status", updateVendorStatus);

module.exports = router;
