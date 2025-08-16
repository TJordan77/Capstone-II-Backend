const express = require("express");
const router = express.Router();
const { sequelize, Hunt, Checkpoint } = require("../database");
const { UserHunt, HuntInvite } = require("../database");
// Just incase we want the hunt routes to require auth later:
// const { requireAuth } = require("../middleware/authMiddleware");

router.post(
  "/",
  /* requireAuth, */ async (req, res) => {
    const body = req.body || {};
    const {
      title,
      name,
      description,
      endsAt,
      maxPlayers,
      visibility,
      coverUrl,
      checkpoints = [],
    } = body;

    if (!title && !name)
      return res.status(400).json({ error: "title is required" });
    if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one checkpoint is required" });
    }

    // Minimal validation of checkpoints
    for (const cp of checkpoints) {
      if (!cp.title || !cp.riddle || !cp.answer) {
        return res
          .status(400)
          .json({ error: "Each checkpoint needs title, riddle, answer" });
      }
    }

    const t = await sequelize.transaction();
    try {
      const hunt = await Hunt.create(
        {
          title: title || name, // accept either key from client
          description: description || "",
          endsAt: endsAt || null,
          maxPlayers: maxPlayers || null,
          visibility: visibility || "public",
          coverUrl: coverUrl || null,
        },
        { transaction: t }
      );

      // Bulk create checkpoints
      const rows = checkpoints.map((cp, i) => ({
        huntId: hunt.id,
        order: cp.order ?? i + 1,
        title: cp.title,
        riddle: cp.riddle,
        answer: cp.answer, // field we’re adding below
        tolerance: cp.tolerance ?? 25, // meters; field we’re adding below
        lat: cp.lat,
        lng: cp.lng,
      }));
      await Checkpoint.bulkCreate(rows, { transaction: t });

      await t.commit();
      return res.status(201).json({ id: hunt.id });
    } catch (err) {
      await t.rollback();
      console.error("POST /api/hunts failed:", err);
      return res.status(500).json({ error: "Failed to create hunt" });
    }
  }
);

// get one hunt with checkpoints
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

// join an existing hunt by code
router.post("/join", async (req, res) => {
  try {
    const code = String(req.body?.joinCode || "")
      .trim()
      .toUpperCase();
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
        defaults: { userId, huntId: hunt.id, status: "joined" },
      });
      userHuntId = row.id;
    }

    return res.json({ huntId: hunt.id, userHuntId });
  } catch (e) {
    console.error("POST /api/hunts/join failed:", e);
    return res.status(500).json({ error: "Failed to join hunt" });
  }
});

module.exports = router;
