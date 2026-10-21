
"use strict";

const express = require("express");
const router = express.Router();

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
} = require("../controllers/productsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

// Products Master is restricted to Admin.
router.use(requireAuth, allowRoles("Admin"));

router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", createProduct);
router.put("/:id", updateProduct);
router.patch("/:id/status", updateProductStatus);

module.exports = router;
