
"use strict";

const express = require("express");
const router = express.Router();

const {
  getClients,
  createClient,
  updateClient,
  updateClientStatus,
} = require("../controllers/clientsController");

const { requireAuth, allowRoles } = require("../middleware/auth");

// All client APIs require an authenticated user.
router.use(requireAuth);

// Admin and HR can view the client list.
router.get("/", allowRoles("Admin", "HR"), getClients);

// Only Admin can create clients.
router.post("/", allowRoles("Admin"), createClient);

// Only Admin can edit client details.
router.put("/:id", allowRoles("Admin"), updateClient);

// Only Admin can activate or deactivate clients.
router.patch("/:id/status", allowRoles("Admin"), updateClientStatus);

module.exports = router;
