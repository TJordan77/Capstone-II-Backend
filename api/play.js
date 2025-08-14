const express = require("express");
const router = express.Router();

const { sequelize, Checkpoint, CheckpointAttempt, UserCheckpointProgress } = require("../database");
const { requireAuth } = require("../middleware/authMiddleware"); // adjust path/name if different

router.post("/play/checkpoints/:checkpointId/attempt", requireAuth, async (req, res) => {
  const { checkpointId } = req.params;
  const { userHuntId, answer, lat, lng } = req.body;

  const t = await sequelize.transaction();
  try {
    const cp = await Checkpoint.findByPk(checkpointId, { transaction: t });
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Lock progress row so attempt limits are race-safe
    let progress = await UserCheckpointProgress.findOne({
      where: { userHuntId, checkpointId },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!progress) {
      progress = await UserCheckpointProgress.create(
        { userHuntId, checkpointId, attemptsCount: 0 },
        { transaction: t }
      );
      await progress.reload({ transaction: t, lock: t.LOCK.UPDATE });
    }

    // Enforce per-checkpoint limit, if set
    if (cp.maxAttempts && progress.attemptsCount >= cp.maxAttempts) {
      await t.rollback();
      return res.status(403).json({ error: "Attempt limit reached for this checkpoint" });
    }

    // Evaluate correctness (swap to hash compare later)
    const norm = (s) => (s || "").trim().toLowerCase();
    const wasCorrect = norm(answer) === norm(cp.answer);

    // Record attempt (history)
    await CheckpointAttempt.create({
      userHuntId,
      checkpointId: cp.id,
      reachedAt: new Date(),
      riddleAnswer: answer,
      wasCorrect,
      badgeEarned: !!wasCorrect,
      attemptLat: lat, 
      attemptLng: lng, 
    }, { transaction: t });

    // Increment counter atomically, set solvedAt if first correct
    await progress.update(
      {
        attemptsCount: progress.attemptsCount + 1,
        solvedAt: wasCorrect && !progress.solvedAt ? new Date() : progress.solvedAt,
      },
      { transaction: t }
    );

    await t.commit();
    return res.status(200).json({
      ok: true,
      wasCorrect,
      attemptsUsed: progress.attemptsCount,
      attemptsRemaining: cp.maxAttempts ? Math.max(0, cp.maxAttempts - progress.attemptsCount) : null,
    });
  } catch (err) {
    await t.rollback();
    console.error("submit attempt failed", err);
    return res.status(500).json({ error: "Failed to submit attempt" });
  }
});

module.exports = router;
