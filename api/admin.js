const express = require("express");
const router = express.Router();
const { requireAuth, requireRole, requireAnyRole } = require("../middleware/authMiddleware");

// Admin-only route
// Only accessible to users with role === 'admin'
router.get("/panel", requireAuth, requireRole("admin"), (req, res) => {
  res.send("Welcome admin!");
});

// Admin or Creator route
// Accessible to users with role === 'admin' or 'creator'
router.get("/creator/stats", requireAuth, requireAnyRole(["admin", "creator"]), (req, res) => {
  res.send("Creators and admins only.");
});

// Debug route to check current user (requires login)
router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
