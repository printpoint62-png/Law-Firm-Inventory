
"use strict";

const express = require("express");
const router = express.Router();

const {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  postPurchase,
  cancelPurchase,
} = require("../controllers/purchasesController");

const { requireAuth, allowRoles } = require("../middleware/auth");

// Purchase operations are restricted to Admin for now.
router.use(requireAuth, allowRoles("Admin"));

router.get("/", getPurchases);
router.get("/:id", getPurchaseById);
router.post("/", createPurchase);
router.put("/:id", updatePurchase);
router.post("/:id/post", postPurchase);
router.post("/:id/cancel", cancelPurchase);

module.exports = router;
