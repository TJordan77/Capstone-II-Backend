const express = require("express");
const router = express.Router();
const { sequelize, Hunt, Checkpoint } = require("../database");
const { UserHunt, HuntInvite } = require("../database");
// Just incase we want the hunt routes to require auth later:
// const { requireAuth } = require("../middleware/authMiddleware");

function generateAccessCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

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

    let hunt = await Hunt.findOne({ where: { accessCode: code } });

    if (!hunt && typeof HuntInvite !== "undefined") {
      const invite = await HuntInvite.findOne({
        where: { code },
        include: [{ model: Hunt, as: "hunt" }],
      });
      if (invite?.hunt) hunt = invite.hunt;
    }

    if (!hunt) return res.status(404).json({ error: "Invalid join code" });

    let userHuntId = null;
    const userId = req.user?.id || req.user?.userId;
    if (userId && typeof UserHunt !== "undefined") {
      const [row] = await UserHunt.findOrCreate({
        where: { userId, huntId: hunt.id },
        defaults: { userId, huntId: hunt.id, status: "joined", startedAt: new Date() },
      });
      userHuntId = row.id;
    }

    return res.json({ huntId: hunt.id, userHuntId });
  } catch (e) {
    console.error("POST /api/hunts/join failed:", e);
    return res.status(500).json({ error: "Failed to join hunt" });
  }
});

// POST /api/hunts/:huntId/join
// Direct-join by huntId (no code). Returns userHuntId (if logged in), and first checkpoint to start
router.post("/:huntId/join", /* requireAuth, */ async (req, res) => {
  try {
    const huntId = Number(req.params.huntId);
    if (!Number.isInteger(huntId) || huntId <= 0) {
      return res.status(400).json({ error: "Invalid huntId" });
    }

    // Pull checkpoints ordered by `order` ASC
    const hunt = await Hunt.findByPk(huntId, {
      include: [{ model: Checkpoint, as: "checkpoints" }],
      order: [[{ model: Checkpoint, as: "checkpoints" }, "order", "ASC"]],
    });

    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    // Create or find the user's participation row (if authenticated)
    let userHuntId = null;
    const userId = req.user?.id || req.user?.userId;
    if (userId && typeof UserHunt !== "undefined") {
      const [row] = await UserHunt.findOrCreate({
        where: { userId, huntId },
        defaults: { userId, huntId, status: "joined", startedAt: new Date() },
      });
      userHuntId = row.id;
    }

    const firstCheckpoint = hunt.checkpoints?.[0] || null;

    return res.json({
      userHuntId,
      firstCheckpointId: firstCheckpoint?.id || null,
    });
  } catch (e) {
    console.error("POST /api/hunts/:huntId/join failed:", e);
    return res.status(500).json({ error: "Failed to join hunt" });
  }
});

module.exports = router;