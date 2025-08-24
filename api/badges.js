const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
// const { requireAuth } = require("../middleware/authMiddleware");

const {
  sequelize,
  Badge,
  UserBadge,
  Checkpoint,
  Hunt,
  User,
} = require("../database");

/* ===========================
   Helpers (kept local/minimal)
   =========================== */
function pickBadge(b) {
  if (!b) return null;
  return {
    id: b.id,
    // map DB fields (title/image) to API shape
    name: b.title ?? b.name,
    imageUrl: b.image ?? b.imageUrl,
    description: b.description,
    checkpointId: b.checkpointId ?? null,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

/* ===== List / Read ===== */

// GET /api/badges
// Optional filters: ?huntId=, ?checkpointId=
router.get("/", /* requireAuth, */ async (req, res) => {
  try {
    const huntId = req.query?.huntId ? Number(req.query.huntId) : null;
    const checkpointId = req.query?.checkpointId ? Number(req.query.checkpointId) : null;

    const where = {};
    if (Number.isInteger(checkpointId) && checkpointId > 0) {
      where.checkpointId = checkpointId;
    }

    // If huntId is provided, resolve to checkpointIds first to avoid alias assumptions
    if (Number.isInteger(huntId) && huntId > 0) {
      const cps = await Checkpoint.findAll({
        where: { huntId },
        attributes: ["id"],
      });
      const cpIds = cps.map((c) => c.id);
      // If no checkpoints, return empty list early
      if (!cpIds.length) return res.json([]);
      where.checkpointId = where.checkpointId
        ? where.checkpointId
        : { [Op.in]: cpIds };
    }

    const rows = await Badge.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    return res.json(rows.map(pickBadge));
  } catch (e) {
    console.error("GET /api/badges failed:", e);
    return res.status(500).json({ error: "Failed to load badges" });
  }
});

// GET /api/badges/checkpoint/:checkpointId
router.get("/checkpoint/:checkpointId", /* requireAuth, */ async (req, res) => {
  const checkpointId = Number(req.params.checkpointId);
  if (!Number.isInteger(checkpointId) || checkpointId <= 0) {
    return res.status(400).json({ error: "Invalid checkpoint id" });
  }
  try {
    const rows = await Badge.findAll({
      where: { checkpointId },
      order: [["createdAt", "DESC"]],
    });
    return res.json(rows.map(pickBadge));
  } catch (e) {
    console.error("GET /api/badges/checkpoint/:checkpointId failed:", e);
    return res.status(500).json({ error: "Failed to load checkpoint badges" });
  }
});

// GET /api/badges/hunt/:huntId
router.get("/hunt/:huntId", /* requireAuth, */ async (req, res) => {
  const huntId = Number(req.params.huntId);
  if (!Number.isInteger(huntId) || huntId <= 0) {
    return res.status(400).json({ error: "Invalid hunt id" });
  }
  try {
    const cps = await Checkpoint.findAll({
      where: { huntId },
      attributes: ["id"],
    });
    const cpIds = cps.map((c) => c.id);
    if (!cpIds.length) return res.json([]);

    const rows = await Badge.findAll({
      where: { checkpointId: { [Op.in]: cpIds } },
      order: [["createdAt", "DESC"]],
    });

    return res.json(rows.map(pickBadge));
  } catch (e) {
    console.error("GET /api/badges/hunt/:huntId failed:", e);
    return res.status(500).json({ error: "Failed to load hunt badges" });
  }
});

// GET /api/badges/user/:userId
// Convenience alias of users/:id/badges for UIs that hit /badges only
router.get("/user/:userId", /* requireAuth, */ async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  try {
    // Try via association include (if alias exists)
    const user = await User.findByPk(userId, {
      include: [{ model: Badge, as: "badges", through: { attributes: ["earnedAt"] } }],
      attributes: ["id"],
    });

    let shaped = null;

    if (user && Array.isArray(user.badges)) {
      const badges = user.badges.map((b) => ({
        ...pickBadge(b),
        // prefer the join-table timestamp if available
        earnedAt: b.UserBadge?.earnedAt || b.createdAt,
      }));
      shaped = badges;
    }

    // Fallback: query the join table directly (handles alias/assoc mismatch)
    if (!shaped) {
      const links = await UserBadge.findAll({
        where: { userId },
        attributes: ["badgeId", "earnedAt"],
        order: [["earnedAt", "DESC"]],
      });

      if (!links.length) return res.json([]);

      const badgeIds = [...new Set(links.map((l) => l.badgeId))];
      const earnedAtById = new Map(links.map((l) => [l.badgeId, l.earnedAt]));

      const badges = await Badge.findAll({ where: { id: badgeIds } });

      shaped = badges.map((b) => ({
        ...pickBadge(b),
        earnedAt: earnedAtById.get(b.id),
      }));
    }

    return res.json(shaped);
  } catch (e) {
    console.error("GET /api/badges/user/:userId failed:", e);
    return res.status(500).json({ error: "Failed to load user badges" });
  }
});

// GET /api/badges/:id
router.get("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const badge = await Badge.findByPk(id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });
    return res.json(pickBadge(badge));
  } catch (e) {
    console.error("GET /api/badges/:id failed:", e);
    return res.status(500).json({ error: "Failed to load badge" });
  }
});

/* ===== Create / Update / Delete ===== */

// POST /api/badges
// Body: { name, imageUrl, description?, checkpointId }
router.post("/", /* requireAuth, */ async (req, res) => {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const imageUrl = body.imageUrl ? String(body.imageUrl) : null;
    const description = body.description != null ? String(body.description) : null;
    const checkpointId = Number(body.checkpointId);

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Number.isInteger(checkpointId) || checkpointId <= 0) {
      return res.status(400).json({ error: "checkpointId is required" });
    }

    const cp = await Checkpoint.findByPk(checkpointId);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Map API -> DB fields
    const badge = await Badge.create({
      title: name,
      image: imageUrl,
      description,
      checkpointId,
    });

    return res.status(201).json(pickBadge(badge));
  } catch (e) {
    console.error("POST /api/badges failed:", e);
    return res.status(500).json({ error: "Failed to create badge" });
  }
});

// PATCH /api/badges/:id
// Body: { name?, imageUrl?, description?, checkpointId? }
router.patch("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const badge = await Badge.findByPk(id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    const { name, imageUrl, description, checkpointId } = req.body || {};

    // Map API -> DB fields (title/image)
    if (name != null) badge.title = String(name);
    if (imageUrl != null) badge.image = String(imageUrl);
    if (description != null) badge.description = String(description);

    if (checkpointId != null) {
      const cpIdNum = Number(checkpointId);
      if (!Number.isInteger(cpIdNum) || cpIdNum <= 0) {
        return res.status(400).json({ error: "Invalid checkpointId" });
      }
      const cp = await Checkpoint.findByPk(cpIdNum);
      if (!cp) return res.status(404).json({ error: "Checkpoint not found" });
      badge.checkpointId = cpIdNum;
    }

    await badge.save();
    return res.json(pickBadge(badge));
  } catch (e) {
    console.error("PATCH /api/badges/:id failed:", e);
    return res.status(500).json({ error: "Failed to update badge" });
  }
});

// DELETE /api/badges/:id
router.delete("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const badge = await Badge.findByPk(id);
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    await badge.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/badges/:id failed:", e);
    return res.status(500).json({ error: "Failed to delete badge" });
  }
});

/* ===== Manual grant (optional) ===== */

// POST /api/badges/grant
// Body: { userId, badgeId }
router.post("/grant", /* requireAuth, */ async (req, res) => {
  try {
    const userId = Number(req.body?.userId);
    const badgeId = Number(req.body?.badgeId);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ error: "Invalid userId" });
    }
    if (!Number.isInteger(badgeId) || badgeId <= 0) {
      return res.status(400).json({ error: "Invalid badgeId" });
    }

    const [user, badge] = await Promise.all([
      User.findByPk(userId),
      Badge.findByPk(badgeId),
    ]);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    const [row, created] = await UserBadge.findOrCreate({
      where: { userId, badgeId },
      defaults: { userId, badgeId, earnedAt: new Date() },
    });

    // Backfill earnedAt if missing on an existing row
    if (!created && !row.earnedAt) {
      row.earnedAt = new Date();
      await row.save();
    }

    const payload = {
      ...pickBadge(badge),
      earnedAt: row.earnedAt,
      newlyGranted: !!created,
    };

    return res.status(created ? 201 : 200).json(payload);
  } catch (e) {
    console.error("POST /api/badges/grant failed:", e);
    return res.status(500).json({ error: "Failed to grant badge" });
  }
});

module.exports = router;
