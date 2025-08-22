const express = require("express");
const router = express.Router();

const {
  sequelize,
  Checkpoint,
  CheckpointAttempt,
  UserCheckpointProgress,
  UserHunt,
  Badge,
  UserBadge,
} = require("../database");
const { requireAuth } = require("../middleware/authMiddleware");

// A little answer normalizer
const norm = (s) => (s || "").trim().toLowerCase();

// Optional geofence helper (meters). Uses a simple flat-earth approx good enough for small radii.
function metersBetween(lat1, lng1, lat2, lng2) {
  // ~111,111 m per degree latitude; longitude scales by cos(latitude)
  const dLat = (lat2 - lat1) * 111111;
  const dLng =
    (lng2 - lng1) * 111111 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Resolve a userId from req or, if missing, via the UserHunt row (keeps attempts playable for logged-in users)
async function resolveUserId(req, userHuntId, t) {
  const uid = req.user?.id || req.user?.userId;
  if (uid) return uid;
  if (userHuntId) {
    const uh = await UserHunt.findByPk(userHuntId, { transaction: t });
    return uh?.userId || null;
  }
  return null;
}

// Get the next checkpoint by (huntId, order)
async function getNextCheckpointId(currentCp, t) {
  if (!currentCp) return null;
  const next = await Checkpoint.findOne({
    where: { huntId: currentCp.huntId, order: currentCp.order + 1 },
    transaction: t,
  });
  return next ? next.id : null;
}

/* ============================================================================
   GET /api/play/checkpoints/:checkpointId
   Returns lightweight checkpoint info for the Play page (NO answer).
   Requires that the user has joined the hunt (UserHunt exists).
   ========================================================================== */

router.get("/checkpoints/:checkpointId", async (req, res) => {
  const { checkpointId } = req.params;
  const cpId = Number(checkpointId);
  if (!Number.isInteger(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }

  try {
    const cp = await Checkpoint.findByPk(cpId, {
      attributes: [
        "id",
        "title",
        "huntId",
        "riddle",
        "lat",
        "lng",
        "tolerance",        // keep both names in case the model uses one or the other
        "toleranceRadius",  // tolerate either; frontend can prefer toleranceRadius || tolerance
        "order",            // often used for sequence
        "sequenceIndex"     // or this, if present in the schema
      ],
    });

    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Making sure the answer isnt included here
    return res.json({
      checkpoint: {
        id: cp.id,
        title: cp.title,
        riddle: cp.riddle,
        lat: cp.lat,
        lng: cp.lng,
        toleranceRadius: cp.toleranceRadius ?? cp.tolerance ?? null,
        sequenceIndex: cp.sequenceIndex ?? cp.order ?? null,
        huntId: cp.huntId,
      },
    });
  } catch (e) {
    console.error("load checkpoint failed", e);
    return res.status(500).json({ error: "Failed to load checkpoint" });
  }
});

/* ============================================================================
   POST /api/play/checkpoints/:checkpointId/attempt
   Submit a riddle answer (+ optional lat/lng), update progress, grant badges,
   and return next checkpoint id if correct.
   ========================================================================== */
router.post(
  "/checkpoints/:checkpointId/attempt",
  requireAuth,
  async (req, res) => {
    const { checkpointId } = req.params;
    const { answer, userHuntId, lat, lng } = req.body || {};

    // Basic validation
    const cpId = Number(checkpointId);
    if (!Number.isInteger(cpId) || cpId <= 0) {
      return res.status(400).json({ error: "Invalid checkpointId" });
    }
    if (typeof answer !== "string" || answer.trim() === "") {
      return res.status(400).json({ error: "answer is required" });
    }

    const t = await sequelize.transaction();
    try {
      // Load checkpoint and current user's hunt participation
      const cp = await Checkpoint.findByPk(cpId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!cp) {
        await t.rollback();
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      const uh = userHuntId
        ? await UserHunt.findByPk(userHuntId, {
            transaction: t,
            lock: t.LOCK.UPDATE,
          })
        : null;

      if (!uh) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "userHuntId is required or invalid" });
      }

      // Verify this checkpoint belongs to the same hunt as user's hunt
      if (uh.huntId !== cp.huntId) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "Checkpoint does not belong to this hunt" });
      }

      // Ensure/lock progress row
      let progress = await UserCheckpointProgress.findOne({
        where: { userHuntId: uh.id, checkpointId: cp.id },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!progress) {
        progress = await UserCheckpointProgress.create(
          { userHuntId: uh.id, checkpointId: cp.id, attemptsCount: 0 },
          { transaction: t }
        );
        await progress.reload({ transaction: t, lock: t.LOCK.UPDATE });
      }

      // Enforce per-checkpoint limit, if set
      if (cp.maxAttempts && progress.attemptsCount >= cp.maxAttempts) {
        await t.rollback();
        return res
          .status(403)
          .json({ error: "Attempt limit reached for this checkpoint" });
      }

      // Evaluate correctness (swap to hash compare later)
      const wasCorrect = norm(answer) === norm(cp.answer);

      /*
     Optional geofence check (disabled by default; wire cp.tolerance if needed)
     if (cp.lat != null && cp.lng != null && cp.tolerance != null && lat != null && lng != null) {
       const dist = metersBetween(Number(lat), Number(lng), cp.lat, cp.lng);
       if (dist > cp.tolerance) {
         await t.rollback();
         return res.status(403).json({ error: "You are too far from the checkpoint" });
       }
     }
    */

      // Record attempt
      await CheckpointAttempt.create(
        {
          userHuntId: uh.id,
          checkpointId: cp.id,
          riddleAnswer: String(answer),
          wasCorrect, // JScript Object Shorthand doesn't need key and value repeated if they're the same name
          attemptLat: lat ?? null,
          attemptLng: lng ?? null,
        },
        { transaction: t }
      );

      // Update progress counters & solved flag
      progress.attemptsCount += 1;
      if (wasCorrect && !progress.solvedAt) {
        progress.solvedAt = new Date();
      }
      await progress.save({ transaction: t });

      // If correct, compute next checkpoint (or mark hunt finished)
      let nextCheckpointId = null;
      if (wasCorrect) {
        nextCheckpointId = await getNextCheckpointId(cp, t);

        // If this was the last checkpoint, mark hunt as completed
        if (!nextCheckpointId) {
          uh.status = "completed";
          uh.completedAt = new Date();
          // compute simple total seconds if startedAt exists
          if (uh.startedAt) {
            uh.totalTimeSeconds = Math.max(
              0,
              Math.floor(
                (uh.completedAt.getTime() - uh.startedAt.getTime()) / 1000
              )
            );
          }
          await uh.save({ transaction: t });

          // Derived badge grants (non-blocking, core 3 only) 
          try {
            const userId = uh.userId;

            // Pathfinder: first full hunt completed
            const pf = await Badge.findOne({ where: { title: "Pathfinder" }, transaction: t });
            if (pf) {
              await UserBadge.findOrCreate({
                where: { userId, badgeId: pf.id },
                defaults: { userId, badgeId: pf.id },
                transaction: t,
              });
            }

            // Speedrunner: completed under X mins (adjust threshold)
            const SPEEDRUN_SECS = 30 * 60;
            if (uh.totalTimeSeconds != null && uh.totalTimeSeconds <= SPEEDRUN_SECS) {
              const sr = await Badge.findOne({ where: { title: "Speedrunner" }, transaction: t });
              if (sr) {
                await UserBadge.findOrCreate({
                  where: { userId, badgeId: sr.id },
                  defaults: { userId, badgeId: sr.id },
                  transaction: t,
                });
              }
            }

            // Badge Collector: earned 5+ badges total
            const count = await UserBadge.count({ where: { userId }, transaction: t });
            if (count >= 5) {
              const bc = await Badge.findOne({ where: { title: "Badge Collector" }, transaction: t });
              if (bc) {
                await UserBadge.findOrCreate({
                  where: { userId, badgeId: bc.id },
                  defaults: { userId, badgeId: bc.id },
                  transaction: t,
                });
              }
            }

            // Sharp Eye intentionally omitted here until "no hints" tracking is wired.
          } catch (e) {
            console.warn("Derived badge grant failed (non-blocking):", e?.message || e);
          }
        }
      }

      // Badge granting (only when correct)
      let grantedBadge = null;
      if (wasCorrect) {
        try {
          const userId = await resolveUserId(req, userHuntId, t);
          if (userId) {
            const badge = await Badge.findOne({
              where: { checkpointId: cp.id },
              transaction: t,
            });
            if (badge) {
              const [userBadge, created] = await UserBadge.findOrCreate({
                where: { userId, badgeId: badge.id },
                defaults: { userId, badgeId: badge.id, earnedAt: new Date() },
                transaction: t,
              });
              grantedBadge = {
                id: badge.id,
                title: badge.title,
                image: badge.image,
                description: badge.description || null,
                newlyEarned: created,
              };
            }
          }
        } catch (e) {
          // Non-blocking: badge grant should not break the core play loop
          console.warn("Badge grant failed (non-blocking):", e?.message || e);
        }
      }

      await t.commit();
      return res.json({
        ok: true,
        wasCorrect,
        attemptsUsed: progress.attemptsCount,
        attemptsRemaining: cp.maxAttempts
          ? Math.max(0, cp.maxAttempts - progress.attemptsCount)
          : null,
        nextCheckpointId,
        finished: wasCorrect && !nextCheckpointId,
        badge: grantedBadge || null,
      });
    } catch (err) {
      await t.rollback();
      console.error("submit attempt failed", err);
      return res.status(500).json({ error: "Failed to submit attempt" });
    }
  }
);

module.exports = router;
