
const express = require("express");
const router = express.Router();

const {
  login,
  me,
  logout,
} = require("../controllers/authController");

const {
  requireAuth,
} = require("../middleware/auth");

router.post("/login", login);
router.get("/me", requireAuth, me);
router.post("/logout", requireAuth, logout);

module.exports = router;
