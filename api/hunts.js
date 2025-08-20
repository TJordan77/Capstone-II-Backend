const express = require("express");
const router = express.Router();
const { sequelize, Hunt, Checkpoint, UserHunt } = require("../database");
const { Op } = require("sequelize"); // added for simple date filters
// Just incase we want the hunt routes to require auth later:
// const { requireAuth } = require("../middleware/authMiddleware");

function generateAccessCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Pretty URL helpers for slug routing
function slugify(s = "") {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
async function ensureUniqueSlug(baseSlug) {
  if (!baseSlug) return null;
  let slug = baseSlug;
  let n = 2;
  while (await Hunt.findOne({ where: { slug } })) {
    slug = `${baseSlug}-${n++}`;
    if (n > 1000) break; // safety guard
  }
  return slug;
}

// Small helpers for creator stats (local to this file)
function computeIsActive(hunt, now = new Date()) {
  if (typeof hunt.isActive === "boolean") return hunt.isActive;
  if (hunt.endsAt instanceof Date) return hunt.endsAt > now;
  return true;
}
async function playersCountByHunt(huntIds = []) {
  if (!huntIds.length) return {};
  const [rows] = await sequelize.query(
    `
    SELECT "huntId", COUNT(DISTINCT "userId")::int AS players
    FROM "UserHunts"
    WHERE "huntId" = ANY(:ids)
    GROUP BY "huntId"
    `,
    { replacements: { ids: huntIds } }
  );
  return rows.reduce((acc, r) => {
    acc[r.huntId] = r.players;
    return acc;
  }, {});
}

// GET /api/hunts/_diag -> quick proof-of-life for DB + first few hunts
router.get("/_diag", async (req, res) => {
  try {
    const hunts = await Hunt.findAll({
      attributes: ["id", "title", "accessCode"],
      order: [["id", "ASC"]],
      limit: 5,
      raw: true,
    });
    res.json({
      dbTail: process.env.DATABASE_URL?.slice(-28) || null, // helps us see which DB
      hunts,
    });
  } catch (e) {
    console.error("GET /api/hunts/_diag failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/hunts
// Create a hunt + it's checkpoints
router.post("/", /* requireAuth, */ async (req, res) => {
  const body = req.body || {};
  const {
    title,
    name,
    description,
    creatorId,

    endsAt,
    maxPlayers,
    visibility,
    coverUrl,

    accessCode,      // optional: client can provide, otherwise auto-generated
    checkpoints = [],
  } = body;

  if (!title && !name) {
    return res.status(400).json({ error: "title is required" });
  }
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return res.status(400).json({ error: "At least one checkpoint is required" });
  }
  for (const cp of checkpoints) {
    if (!cp.title || !cp.riddle || !cp.answer || cp.lat == null || cp.lng == null) {
      return res.status(400).json({
        error: "Each checkpoint needs title, riddle, answer, lat, lng",
      });
    }
  }

  const t = await sequelize.transaction();
  try {
    // Derive a unique slug if not provided and we have a title/name
    let derivedSlug = null;
    if (!body.slug && (title || name)) {
      derivedSlug = await ensureUniqueSlug(slugify(title || name));
    }

    const hunt = await Hunt.create(
      {
        title: title || name,
        description: description || "",
        creatorId: creatorId ?? null,

        endsAt: endsAt ?? null,
        maxPlayers: maxPlayers ?? null,
        visibility: visibility ?? "public",
        coverUrl: coverUrl ?? null,

        isPublished: false,
        isActive: true,
        version: 1,

        // pretty URL slug (optional)
        slug: body.slug || derivedSlug || null,

        // Generate if not provided
        accessCode: accessCode || generateAccessCode(),
      },
      { transaction: t }
    );

    const rows = checkpoints.map((cp, i) => ({
      huntId: hunt.id,
      order: cp.order ?? i + 1,
      title: cp.title,
      riddle: cp.riddle,
      answer: cp.answer,
      tolerance: cp.tolerance ?? 25,
      lat: cp.lat,
      lng: cp.lng,
      hint: cp.hint ?? null,
    }));
    await Checkpoint.bulkCreate(rows, { transaction: t });

    await t.commit();
    return res.status(201).json({ id: hunt.id, accessCode: hunt.accessCode });
  } catch (err) {
    await t.rollback();
    console.error("POST /api/hunts failed:", err);
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Access code already exists. Try again." });
    }
    return res.status(500).json({ error: "Failed to create hunt" });
  }
});

// GET /api/hunts/slug/:slug
// Returns a hunt by slug with its checkpoints ordered by `order` ASC
router.get("/slug/:slug", async (req, res) => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: "Invalid slug" });
  try {
    const hunt = await Hunt.findOne({
      where: { slug },
      include: [{ model: Checkpoint, as: "checkpoints" }],
      order: [[{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"]],
    });
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });
    return res.json(hunt);
  } catch (e) {
    console.error("GET /api/hunts/slug/:slug failed:", e);
    return res.status(500).json({ error: "Failed to load hunt" });
  }
});

// GET /api/hunts/:id
// Returns a hunt with its checkpoints ordered by `order` ASC
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }

  try {
    const hunt = await Hunt.findByPk(id, {
      include: [
        {
          model: Checkpoint,
          as: "checkpoints",
        },
      ],
      order: [[{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"]],
    });

    if (!hunt) return res.status(404).json({ error: "Hunt not found" });
    return res.json(hunt);
  } catch (e) {
    console.error("GET /api/hunts/:id failed:", {
      name: e.name,
      message: e.message,
      stack: e.stack,
      db: e.original?.message || e.parent?.message,
      detail: e.original?.detail || e.parent?.detail,
    });
    return res.status(500).json({ error: "Failed to load hunt" });
  }
});

// POST /api/hunts/join
// Join a hunt by a code (invite or public access code)
router.post("/join", async (req, res) => {
  try {
    const code = String(req.body?.joinCode || "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "joinCode is required" });

    // Try direct accessCode only (no invites)
    const hunt = await Hunt.findOne({ where: { accessCode: code } });
    if (!hunt) return res.status(404).json({ error: "Invalid join code" });

    let userHuntId = null;
    const userId = req.user?.id || req.user?.userId;
    if (userId && typeof UserHunt !== "undefined") {
      const [row] = await UserHunt.findOrCreate({
        where: { userId, huntId: hunt.id },
        // IMPORTANT: use your enum values; seed uses "active"/"completed"
        defaults: { userId, huntId: hunt.id, status: "active", startedAt: new Date() },
      });
      userHuntId = row.id;
    }

    return res.json({ huntId: hunt.id, userHuntId });
  } catch (e) {
    console.error("POST /api/hunts/join failed:", e?.message || e, e?.stack);
    return res.status(500).json({ error: "Failed to join hunt" });
  }
});

// POST /api/hunts/:idOrSlug/join
// Direct-join by either numeric id OR slug in one endpoint. Returns userHuntId (if logged in) and first checkpoint to start
router.post("/:idOrSlug/join", /* requireAuth, */ async (req, res) => {
  try {
    const idOrSlug = String(req.params.idOrSlug || "").trim().toLowerCase();
    if (!idOrSlug) return res.status(400).json({ error: "Invalid id or slug" });

    // If all digits → treat as id; otherwise → slug
    const where = /^\d+$/.test(idOrSlug) ? { id: Number(idOrSlug) } : { slug: idOrSlug };

    // Pull checkpoints ordered by `order` ASC
    const hunt = await Hunt.findOne({
      where,
      include: [{ model: Checkpoint, as: "checkpoints" }],
      order: [[{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"]],
    });

    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    // Create or find the user's participation row (if authenticated)
    let userHuntId = null;
    const userId = req.user?.id || req.user?.userId;
    if (userId && typeof UserHunt !== "undefined") {
      const [row] = await UserHunt.findOrCreate({
        where: { userId, huntId: hunt.id },
        defaults: { userId, huntId: hunt.id, status: "active", startedAt: new Date() },
      });
      userHuntId = row.id;
    }

    const firstCheckpoint = hunt.checkpoints?.[0] || null;

    return res.json({
      userHuntId,
      huntId: hunt.id,
      firstCheckpointId: firstCheckpoint?.id || null,
    });
  } catch (e) {
    console.error("POST /api/hunts/:idOrSlug/join failed:", e);
    return res.status(500).json({ error: "Failed to join hunt" });
  }
});

/* ====== Creator Dashboard / Route Designer  ====== */

// GET /api/hunts/creator/:id  -> list a creator's hunts (includes checkpoints)
// now also returns playersCount + normalized isActive for each hunt
router.get("/creator/:id", /* requireAuth, */ async (req, res) => {
  const creatorId = Number(req.params.id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    return res.status(400).json({ error: "Invalid creator id" });
  }
  try {
    const hunts = await Hunt.findAll({
      where: { creatorId },
      include: [{ model: Checkpoint, as: "checkpoints" }],
      order: [
        ["createdAt", "DESC"],
        [{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"],
      ],
    });

    const ids = hunts.map(h => h.id);
    const counts = await playersCountByHunt(ids);
    const now = new Date();

    const payload = hunts.map(h => {
      const j = h.toJSON();
      return {
        ...j,
        isActive: computeIsActive(j, now),
        playersCount: counts[h.id] || 0,
      };
    });

    return res.json(payload);
  } catch (e) {
    console.error("GET /api/hunts/creator/:id failed:", e);
    return res.status(500).json({ error: "Failed to load creator hunts" });
  }
});

// GET /api/hunts/creator/:id/stats  -> totals for dashboard tiles
router.get("/creator/:id/stats", /* requireAuth, */ async (req, res) => {
  const creatorId = Number(req.params.id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    return res.status(400).json({ error: "Invalid creator id" });
  }
  try {
    const total = await Hunt.count({ where: { creatorId } });

    const activeHunts = await Hunt.findAll({
      where: {
        creatorId,
        [Op.or]: [{ isActive: true }, { endsAt: { [Op.gt]: new Date() } }],
      },
      attributes: ["id"],
    });
    const activeIds = activeHunts.map(h => h.id);

    let activePlayers = 0;
    if (activeIds.length) {
      const [rowset] = await sequelize.query(
        `
        SELECT COUNT(DISTINCT "userId")::int AS count
        FROM "UserHunts"
        WHERE "huntId" = ANY(:ids)
        `,
        { replacements: { ids: activeIds } }
      );
      activePlayers = rowset?.[0]?.count || 0;
    }

    const completed = await Hunt.count({
      where: {
        creatorId,
        [Op.or]: [{ isActive: false }, { endsAt: { [Op.lte]: new Date() } }],
      },
    });

    return res.json({ total, activePlayers, completed });
  } catch (e) {
    console.error("GET /api/hunts/creator/:id/stats failed:", e);
    return res.status(500).json({ error: "Failed to compute creator stats" });
  }
});

// GET /api/hunts/creator/:id/overview -> { stats, hunts } in one call
router.get("/creator/:id/overview", /* requireAuth, */ async (req, res) => {
  const creatorId = Number(req.params.id);
  if (!Number.isInteger(creatorId) || creatorId <= 0) {
    return res.status(400).json({ error: "Invalid creator id" });
  }
  try {
    const total = await Hunt.count({ where: { creatorId } });

    const activeHunts = await Hunt.findAll({
      where: {
        creatorId,
        [Op.or]: [{ isActive: true }, { endsAt: { [Op.gt]: new Date() } }],
      },
      attributes: ["id"],
    });
    const activeIds = activeHunts.map(h => h.id);

    let activePlayers = 0;
    if (activeIds.length) {
      const [rowset] = await sequelize.query(
        `
        SELECT COUNT(DISTINCT "userId")::int AS count
        FROM "UserHunts"
        WHERE "huntId" = ANY(:ids)
        `,
        { replacements: { ids: activeIds } }
      );
      activePlayers = rowset?.[0]?.count || 0;
    }

    const completed = await Hunt.count({
      where: {
        creatorId,
        [Op.or]: [{ isActive: false }, { endsAt: { [Op.lte]: new Date() } }],
      },
    });

    const hunts = await Hunt.findAll({
      where: { creatorId },
      include: [{ model: Checkpoint, as: "checkpoints" }],
      order: [
        ["createdAt", "DESC"],
        [{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"],
      ],
      attributes: { exclude: [] },
    });

    const ids = hunts.map(h => h.id);
    const counts = await playersCountByHunt(ids);
    const now = new Date();

    const huntsPayload = hunts.map(h => {
      const j = h.toJSON();
      return {
        ...j,
        isActive: computeIsActive(j, now),
        playersCount: counts[h.id] || 0,
      };
    });

    return res.json({
      stats: { total, activePlayers, completed },
      hunts: huntsPayload,
    });
  } catch (e) {
    console.error("GET /api/hunts/creator/:id/overview failed:", e);
    return res.status(500).json({ error: "Failed to load creator overview" });
  }
});

// PATCH /api/hunts/:id  -> update title/description 
router.patch("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const hunt = await Hunt.findByPk(id);
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    const { title, description } = req.body || {};
    if (title != null) hunt.title = String(title);
    if (description != null) hunt.description = String(description);

    await hunt.save();
    return res.json(hunt);
  } catch (e) {
    console.error("PATCH /api/hunts/:id failed:", e);
    return res.status(500).json({ error: "Failed to update hunt" });
  }
});

// DELETE /api/hunts/:id  -> delete a hunt (and its checkpoints via FK constraints)
router.delete("/:id", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const hunt = await Hunt.findByPk(id);
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    await hunt.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/hunts/:id failed:", e);
    return res.status(500).json({ error: "Failed to delete hunt" });
  }
});

// PATCH /api/hunts/:id/publish  -> toggle publish status
// Enforces: a hunt must have at least 1 checkpoint to be published
router.patch("/:id/publish", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const hunt = await Hunt.findByPk(id);
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    const count = await Checkpoint.count({ where: { huntId: id } });
    if (count === 0) {
      return res.status(400).json({ error: "Add at least one checkpoint before publishing" });
    }

    hunt.isPublished = !hunt.isPublished;
    await hunt.save();
    return res.json(hunt);
  } catch (e) {
    console.error("PATCH /api/hunts/:id/publish failed:", e);
    return res.status(500).json({ error: "Failed to toggle publish status" });
  }
});

// POST /api/hunts/:id/checkpoints  -> add a checkpoint to a hunt (drag/map-based)
// Enforces minimal validation and unique order within the hunt
router.post("/:id/checkpoints", /* requireAuth, */ async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid id" });
  }
  try {
    const hunt = await Hunt.findByPk(id);
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    const { title, riddle, answer, hint, lat, lng, tolerance, order } = req.body || {};
    if (!title || !riddle || !answer) {
      return res.status(400).json({ error: "title, riddle, answer are required" });
    }
    if (lat == null || lng == null) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const maxOrder =
      (await Checkpoint.max("order", { where: { huntId: id } })) || 0;
    const desiredOrder =
      Number.isFinite(Number(order)) && Number(order) > 0 ? Number(order) : maxOrder + 1;

    // Unique order per hunt
    const exists = await Checkpoint.findOne({ where: { huntId: id, order: desiredOrder } });
    if (exists) {
      return res.status(409).json({ error: "Checkpoint order already in use" });
    }

    const cp = await Checkpoint.create({
      huntId: id,
      order: desiredOrder,
      title,
      riddle,
      answer,
      hint: hint ?? null,
      lat,
      lng,
      tolerance: tolerance ?? 25,
    });

    return res.status(201).json(cp);
  } catch (e) {
    console.error("POST /api/hunts/:id/checkpoints failed:", e);
    return res.status(500).json({ error: "Failed to add checkpoint" });
  }
});

module.exports = router;
