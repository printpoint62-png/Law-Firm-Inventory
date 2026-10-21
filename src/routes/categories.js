
"use strict";

const express = require("express");
const router = express.Router();

const {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
} = require("../controllers/categoriesController");

const { requireAuth, allowRoles } = require("../middleware/auth");

router.use(requireAuth, allowRoles("Admin"));

router.get("/", getCategories);
router.post("/", createCategory);
router.put("/:id", updateCategory);
router.patch("/:id/status", updateCategoryStatus);

module.exports = router;
