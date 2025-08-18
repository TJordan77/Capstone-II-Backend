const express = require("express");
const router = express.Router();
const { Op } = require("sequelize");
const { Checkpoint, Hunt } = require("../database");
// Just incase we want the checkpoint routes to require auth later:
// const { requireAuth } = require("../middleware/authMiddleware");

// POST /api/checkpoints
// Create a checkpoint (Editor sometimes sends huntId directly)
// Enforces minimal validation and unique order within the hunt
router.post("/", /* requireAuth, */ async (req, res) => {
  try {
    const {
      huntId,
      title,
      riddle,
      answer,
      hint,
      lat,
      lng,
      tolerance,
      order,
    } = req.body || {};

    if (!huntId) return res.status(400).json({ error: "huntId is required" });
    if (!title || !riddle || !answer) {
      return res.status(400).json({ error: "title, riddle, answer are required" });
    }
    if (lat == null || lng == null) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    const hunt = await Hunt.findByPk(huntId);
    if (!hunt) return res.status(404).json({ error: "Hunt not found" });

    // Compute desired order (default to max+1)
    const maxOrder = (await Checkpoint.max("order", { where: { huntId } })) || 0;
    const desiredOrder =
      Number.isFinite(Number(order)) && Number(order) > 0 ? Number(order) : maxOrder + 1;

    // Unique order per hunt
    const exists = await Checkpoint.findOne({ where: { huntId, order: desiredOrder } });
    if (exists) return res.status(409).json({ error: "Checkpoint order already in use" });

    const cp = await Checkpoint.create({
      huntId,
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
    console.error("POST /api/checkpoints failed:", e);
    return res.status(500).json({ error: "Failed to create checkpoint" });
  }
});


// PATCH /api/checkpoints/:id
// Update a checkpoint (riddle, hint, coords, order, etc.)
// Enforces unique order within the hunt if order changes
router.patch("/:id", /* requireAuth, */ async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const cp = await Checkpoint.findByPk(id);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    const updates = req.body || {};
    const allowed = ["title", "riddle", "answer", "hint", "lat", "lng", "tolerance", "order"];

    // Assign allowed fields only
    for (const key of allowed) {
      if (key in updates) cp[key] = updates[key];
    }

    // Validate required fields if they were provided (keeping this light)
    if ("title" in updates && !String(cp.title || "").trim()) {
      return res.status(400).json({ error: "title cannot be empty" });
    }
    if ("riddle" in updates && !String(cp.riddle || "").trim()) {
      return res.status(400).json({ error: "riddle cannot be empty" });
    }
    if ("answer" in updates && !String(cp.answer || "").trim()) {
      return res.status(400).json({ error: "answer cannot be empty" });
    }
    if (("lat" in updates && cp.lat == null) || ("lng" in updates && cp.lng == null)) {
      return res.status(400).json({ error: "lat and lng are required" });
    }

    // If order changed, enforce uniqueness within the same hunt
    if ("order" in updates && Number.isFinite(Number(cp.order)) && cp.order > 0) {
      const conflict = await Checkpoint.findOne({
        where: {
          huntId: cp.huntId,
          order: cp.order,
          id: { [Op.ne]: cp.id },
        },
      });
      if (conflict) {
        return res.status(409).json({ error: "Checkpoint order already in use" });
      }
    }

    await cp.save();
    return res.json(cp);
  } catch (e) {
    console.error("PATCH /api/checkpoints/:id failed:", e);
    return res.status(500).json({ error: "Failed to update checkpoint" });
  }
});

// DELETE /api/checkpoints/:id
// Delete a checkpoint (designer removes a node)
router.delete("/:id", /* requireAuth, */ async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const cp = await Checkpoint.findByPk(id);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    await cp.destroy();
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/checkpoints/:id failed:", e);
    return res.status(500).json({ error: "Failed to delete checkpoint" });
  }
});

module.exports = router;
