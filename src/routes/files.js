
"use strict";

const express = require("express");
const router = express.Router();

const {
  getFiles,
  getFileById,
  lookupFileByNumber,
  createFile,
  updateFile,
  updateFileStatus,
} = require("../controllers/filesController");

const { requireAuth, allowRoles } = require("../middleware/auth");

// All file APIs require authentication.
router.use(requireAuth);

// File directory: Admin and HR can view files.
router.get("/", allowRoles("Admin", "HR"), getFiles);

// File number lookup: Admin and HR.
router.get(
  "/lookup/:fileNumber",
  allowRoles("Admin", "HR"),
  lookupFileByNumber
);

// Specific file: Admin and HR.
router.get("/:id", allowRoles("Admin", "HR"), getFileById);

// Only Admin can create files.
router.post("/", allowRoles("Admin"), createFile);

// Only Admin can update file details.
router.put("/:id", allowRoles("Admin"), updateFile);

// Only Admin can change file status.
router.patch("/:id/status", allowRoles("Admin"), updateFileStatus);

module.exports = router;
