
"use strict";

const express = require("express");
const router = express.Router();

const {
  listUsers,
  createUser,
  updateUserStatus,
  listActiveStaff,
} = require("../controllers/userManagementController");

const {
  requireAuth,
  allowRoles,
} = require("../middleware/auth");

// Admin and HR can view only the active Staff list.
router.get(
  "/active-staff",
  requireAuth,
  allowRoles("Admin", "HR"),
  listActiveStaff
);

// Only Admin can view all users.
router.get(
  "/",
  requireAuth,
  allowRoles("Admin"),
  listUsers
);

// Only Admin can create HR and Staff accounts.
router.post(
  "/",
  requireAuth,
  allowRoles("Admin"),
  createUser
);

// Only Admin can activate/deactivate HR and Staff accounts.
router.patch(
  "/:id/status",
  requireAuth,
  allowRoles("Admin"),
  updateUserStatus
);

module.exports = router;
