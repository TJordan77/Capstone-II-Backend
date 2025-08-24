const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const jwt = require("jsonwebtoken"); // <-- ADDED: verify cookie token locally
const {
  sequelize,
  User,
  Badge,
  UserBadge,
  Hunt,
  UserHunt,
  UserCheckpointProgress,
} = require("../database");
const { requireAuth } = require("../middleware/authMiddleware"); // <-- enabled

/* ====== Minimal Profile Endpoints (mounted under this router) ====== */
/* NOTE: Hey so because these are defined in this file, their effective paths will be
   prefixed by wherever this router is mounted (e.g., /api/hunts).
   Resulting examples (Assuming we're mounted at /api/hunts):
     - GET /api/hunts/users/me
     - GET /api/hunts/users/:id
     - GET /api/hunts/users/:id/badges
     - GET /api/hunts/users/:id/hunts/created
     - GET /api/hunts/users/:id/hunts/joined
*/
// (In this file we mount at /api/users, so the effective paths are /api/users/me, etc.)

// small shapers kept local
function pickUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    // your model uses profilePicture, not avatarUrl
    avatarUrl: u.profilePicture || null,
    createdAt: u.createdAt,
  };
}
function pickHunt(h) {
  return {
    id: h.id,
    title: h.title || h.name,
    description: h.description,
    coverUrl: h.coverUrl,
    isActive: !!(h.isActive ?? (h.endsAt ? new Date(h.endsAt) > new Date() : true)),
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}
function pickBadge(b, earnedAt) {
  return {
    id: b.id,
    // map DB fields (title/image) to API shape
    name: b.title ?? b.name,
    imageUrl: b.image ?? b.imageUrl,
    description: b.description,
    earnedAt,
  };
}

// GET /users/me
router.get("/me", /* requireAuth, */ async (req, res) => { // <-- protected
  try {
    // Read JWT from cookie directly to avoid header/cookie mismatch
    const token = req.cookies && req.cookies.token;
    if (!token) return res.status(401).json({ error: "Not authenticated" });

    let payload;
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error("JWT_SECRET missing");
      payload = jwt.verify(token, secret);
    } catch (e) {
      return res.status(403).json({ error: "Invalid or expired token" });
    }

    const userId = payload?.id || payload?.userId;
    if (!userId) return res.status(401).json({ error: "Not authenticated" });

    const me = await User.findByPk(userId);
    if (!me) return res.status(404).json({ error: "User not found" });

    res.json(pickUser(me));
  } catch (e) {
    console.error("GET /api/users/me failed:", e);
    res.status(500).json({ error: "Failed to load profile" });
  }
});

// GET /users/:id
router.get("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });
  try {
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(pickUser(user));
  } catch (e) {
    console.error("GET /api/users/:id failed:", e);
    res.status(500).json({ error: "Failed to load user" });
  }
});

// GET /users/:id/badges
router.get("/:id/badges", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });
  try {
    // ✅ Robust to association alias differences:
    // Read from the join table, then fetch the Badge rows explicitly.
    const links = await UserBadge.findAll({
      where: { userId: id },
      attributes: ["badgeId", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    if (!links.length) return res.json([]);

    const badgeIds = [...new Set(links.map((l) => l.badgeId))].filter(Boolean);
    if (!badgeIds.length) return res.json([]);

    const badges = await Badge.findAll({ where: { id: badgeIds } });

    // Index earnedAt from links by badgeId
    const earnedAtById = new Map(links.map((l) => [l.badgeId, l.createdAt]));

    const shaped = badges.map((b) => pickBadge(b, earnedAtById.get(b.id)));
    res.json(shaped);
  } catch (e) {
    console.error("GET /api/users/:id/badges failed:", e);
    res.status(500).json({ error: "Failed to load badges" });
  }
});

// GET /users/:id/hunts/created
router.get("/:id/hunts/created", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });
  try {
    const hunts = await Hunt.findAll({
      where: { creatorId: id },
      order: [["createdAt", "DESC"]],
    });
    res.json(hunts.map(pickHunt));
  } catch (e) {
    console.error("GET /api/users/:id/hunts/created failed:", e);
    res.status(500).json({ error: "Failed to load created hunts" });
  }
});

// GET /users/:id/hunts/joined
router.get("/:id/hunts/joined", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

  try {
    const joins = await UserHunt.findAll({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
      attributes: ["id", "huntId", "createdAt", "completedAt"],
    });

    if (!joins.length) return res.json([]);

    const huntIds = [...new Set(joins.map(j => j.huntId).filter(Boolean))];
    if (!huntIds.length) return res.json([]);

    const hunts = await Hunt.findAll({ where: { id: huntIds } });
    const huntsById = new Map(hunts.map(h => [h.id, h]));

    const results = [];
    for (const j of joins) {
      const h = huntsById.get(j.huntId);
      if (!h) continue;

      // ✅ UserCheckpointProgress uses userHuntId (not userId/huntId)
      const solved = await UserCheckpointProgress.count({
        where: { userHuntId: j.id, solvedAt: { [Op.ne]: null } },
      });

      results.push({
        ...pickHunt(h),
        userHuntId: j.id,
        joinedAt: j.createdAt,
        completedAt: j.completedAt,
        solvedCount: solved,
      });
    }
    res.json(results);
  } catch (e) {
    console.error("GET /api/users/:id/hunts/joined failed:", e);
    res.status(500).json({ error: "Failed to load joined hunts" });
  }
});

// GET /api/users/:id/overview - Added in to help playerdashboard
router.get("/:id/overview", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

  try {
    const [badgeRows, joins] = await Promise.all([
      UserBadge.findAll({ where: { userId: id }, attributes: ["id"] }),
      UserHunt.findAll({
        where: { userId: id },
        include: [{ model: Hunt, as: "hunt" }],
        order: [["createdAt", "DESC"]],
      }),
    ]);

    const hunts = [];
    for (const j of joins) {
      if (!j.hunt) continue;
      hunts.push({
        id: j.hunt.id,
        title: j.hunt.title || j.hunt.name,
        description: j.hunt.description,
        coverUrl: j.hunt.coverUrl,
        createdAt: j.hunt.createdAt,
        updatedAt: j.hunt.updatedAt,
        userHuntId: j.id,
        joinedAt: j.createdAt,
        completedAt: j.completedAt || null,
      });
    }

    const stats = {
      inProgress: hunts.filter(h => !h.completedAt).length,
      completed: hunts.filter(h => !!h.completedAt).length,
      badges: badgeRows.length,
    };

    res.json({ stats, hunts });
  } catch (e) {
    console.error("GET /api/users/:id/overview failed:", e);
    res.status(500).json({ error: "Failed to load player overview" });
  }
});

module.exports = router;
