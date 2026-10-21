
"use strict";

const express = require("express");
const router = express.Router();

const {
  getBrands,
  createBrand,
  updateBrand,
  updateBrandStatus,
} = require("../controllers/brandsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

router.use(requireAuth, allowRoles("Admin"));

router.get("/", getBrands);
router.post("/", createBrand);
router.put("/:id", updateBrand);
router.patch("/:id/status", updateBrandStatus);

module.exports = router;
