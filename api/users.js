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
  return (name || "")
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
    const rows = await UserBadge.findAll({
      where: { userId: id },
      include: [{ model: Badge }],
      order: [["id", "ASC"]],
    });

    const badges = rows.map((row) => ({
      id: row.Badge.id,
      name: row.Badge.name || row.Badge.title,
      description: row.Badge.description || "",
      imageUrl: getBadgeIcon(row.Badge),
      checkpointId: row.Badge.checkpointId,
    }));

    res.json(badges);
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
      order: [["startedAt", "DESC"]],
    });

    const hunts = [];
    for (const j of joins) {
      const h = await Hunt.findByPk(j.huntId);
      if (!h) continue;
      hunts.push(pickHunt(h));
    }

    res.json(hunts);
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

// GET /users/:id/certificate/:huntId -> returns an SVG certificate
router.get("/:id/certificate/:huntId", /* requireAuth, */ async (req, res) => {
  const userId = Number(req.params.id);
  const huntId = Number(req.params.huntId);
  if (!Number.isFinite(userId) || !Number.isFinite(huntId)) {
    return res.status(400).json({ error: "Invalid id(s)" });
  }
  try {
    const [user, hunt, uh] = await Promise.all([
      User.findByPk(userId),
      Hunt.findByPk(huntId),
      UserHunt.findOne({ where: { userId, huntId } }),
    ]);
    if (!user || !hunt) return res.status(404).json({ error: "Not found" });
    if (!uh || !uh.completedAt) return res.status(403).json({ error: "Certificate available after completion" });

    const completed = new Date(uh.completedAt).toLocaleDateString();
    const duration = uh.totalTimeSeconds != null ? `${Math.floor(uh.totalTimeSeconds/60)}m ${uh.totalTimeSeconds%60}s` : "—";

    // Simple inline SVG; client may download or display directly
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e7a7e"/>
      <stop offset="100%" stop-color="#0da595"/>
    </linearGradient>
    <style>
      .h1 { font: 700 64px sans-serif; fill: #ffd23a; letter-spacing: 1px; }
      .h2 { font: 600 36px sans-serif; fill: #e9f6ee; }
      .body { font: 400 24px sans-serif; fill: #e9f6ee; }
      .muted { font: 400 18px sans-serif; fill: #c9ece8; }
      .box { stroke: #ffd23a; stroke-width: 6; fill: rgba(0,0,0,0.08) }
    </style>
  </defs>
  <rect x="0" y="0" width="1200" height="800" fill="url(#g)"/>
  <rect x="40" y="40" width="1120" height="720" rx="24" class="box"/>
  <text x="600" y="180" text-anchor="middle" class="h1">SideQuest Certificate</text>
  <text x="600" y="260" text-anchor="middle" class="h2">Awarded to</text>
  <text x="600" y="320" text-anchor="middle" class="h1" style="font-size:48px">${(user.username || (user.firstName + " " + user.lastName)).toUpperCase()}</text>
  <text x="600" y="400" text-anchor="middle" class="h2">for completing</text>
  <text x="600" y="460" text-anchor="middle" class="h1" style="font-size:52px">${(hunt.title || "Untitled Hunt").toUpperCase()}</text>
  <text x="600" y="520" text-anchor="middle" class="body">Completed on ${completed} • Time ${duration}</text>
  <text x="600" y="580" text-anchor="middle" class="muted">Certificate ID: U${user.id}-H${hunt.id}</text>
</svg>`;

    if (String(req.query.download || "") === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="certificate-${user.id}-${hunt.id}.svg"`);
    }
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.send(svg);
  } catch (e) {
    console.error("GET /users/:id/certificate/:huntId failed:", e);
    res.status(500).json({ error: "Failed to generate certificate" });
  }
});

module.exports = router;
