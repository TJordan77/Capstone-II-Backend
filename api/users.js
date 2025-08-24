const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Badge,
  UserBadge,
  Hunt,
  UserHunt,
  UserCheckpointProgress,
} = require("../database");
const { requireAuth } = require("../middleware/authMiddleware"); 

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

// util helpers kept small and dumb (no sequelize instances leaking to client)
function pickUser(u) {
  if (!u) return null;
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
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
    slug: h.slug || null,
    isActive: h.isActive,
    isPublished: h.isPublished,
    visibility: h.visibility,
  };
}

function slugifyName(name = "") {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getBadgeIcon(badge) {
  if (badge?.imageUrl) return badge.imageUrl;
  const slug = slugifyName(badge?.name || "");
  return `/icon-${slug}.png`;
}

// GET /users/:id
router.get("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

  try {
    const u = await User.findByPk(id);
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(pickUser(u));
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
    // Read from the join table, then fetch the Badge rows explicitly.
    const links = await UserBadge.findAll({
      where: { userId: id },
      attributes: ["badgeId", "earnedAt"], // use earnedAt, not createdAt
      order: [["earnedAt", "DESC"]],
    });

    if (!links.length) return res.json([]);

    const badgeIds = [...new Set(links.map((l) => l.badgeId))];
    const badges = await Badge.findAll({ where: { id: badgeIds } });

    // Map to a uniform shape the UI expects
    const byId = new Map(badges.map((b) => [b.id, b]));
    const results = links
      .map((l) => byId.get(l.badgeId))
      .filter(Boolean)
      .map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description || "",
        imageUrl: getBadgeIcon(b),
        earnedAt: links.find((l) => l.badgeId === b.id)?.earnedAt || null,
      }));

    res.json(results);
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
    // UserHunt has no createdAt; order by startedAt
    const joins = await UserHunt.findAll({
      where: { userId: id },
      order: [["startedAt", "DESC"]],
    });

    const results = [];
    for (const j of joins) {
      const h = await Hunt.findByPk(j.huntId);
      if (!h) continue;

      const solved = await UserCheckpointProgress.count({
        where: { userHuntId: j.id, solvedAt: { [Op.ne]: null } },
      });

      results.push({
        ...pickHunt(h),
        userHuntId: j.id,
        joinedAt: j.startedAt || null,
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

// GET /users/:id/overview
router.get("/:id/overview", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user id" });

  try {
    const [badgeRows, joins] = await Promise.all([
      UserBadge.findAll({ where: { userId: id }, attributes: ["id"] }),
      UserHunt.findAll({
        where: { userId: id },
        order: [["startedAt", "DESC"]],
      }),
    ]);

    const hunts = [];
    for (const j of joins) {
      const h = await Hunt.findByPk(j.huntId);
      if (!h) continue;
      hunts.push({
        id: h.id,
        title: h.title || h.name,
        description: h.description,
        coverUrl: h.coverUrl,
        createdAt: h.createdAt,
        updatedAt: h.updatedAt,
        userHuntId: j.id,
        joinedAt: j.startedAt || null,
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
