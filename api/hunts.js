const express = require("express");
const router = express.Router();
const { sequelize, Hunt, Checkpoint } = require("../database");
// Just incase we want the hunt routes to require auth later: 
// const { requireAuth } = require("../middleware/authMiddleware");

router.post("/", /* requireAuth, */ async (req, res) => {
  const body = req.body || {};
  const {
    title, name, description, endsAt, maxPlayers, visibility, coverUrl,
    checkpoints = [],
  } = body;

  if (!title && !name) return res.status(400).json({ error: "title is required" });
  if (!Array.isArray(checkpoints) || checkpoints.length === 0) {
    return res.status(400).json({ error: "At least one checkpoint is required" });
  }

  // Minimal validation of checkpoints
  for (const cp of checkpoints) {
    if (!cp.title || !cp.riddle || !cp.answer) {
      return res.status(400).json({ error: "Each checkpoint needs title, riddle, answer" });
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
      answer: cp.answer,             // field we’re adding below
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
});

module.exports = router;
