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

// Simple meter offsets: (northMeters, eastMeters) from a base lat/lng
function offsetMeters(lat, lng, northMeters, eastMeters) {
  const dLat = northMeters / 111111; // meters per degree latitude
  const dLng = eastMeters / (111111 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
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
    const cp = await Checkpoint.findByPk(cpId); // <-- no attributes array
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

    // Read safely from either camelCase or snake_case depending on your model/DB mapping
    const row = cp.toJSON ? cp.toJSON() : cp;

    const toleranceRadius =
      row.toleranceRadius ?? row.tolerance ?? row.tolerance_radius ?? null;

    const sequenceIndex =
      row.sequenceIndex ?? row.order ?? row.sequence_index ?? null;

    return res.json({
      checkpoint: {
        id: row.id,
        title: row.title,
        riddle: row.riddle,
        lat: row.lat,
        lng: row.lng,
        toleranceRadius,
        sequenceIndex,
        huntId: row.huntId ?? row.hunt_id ?? null,
      },
    });
  } catch (e) {
    // Helpful diagnostics in logs, but keep client message generic
    console.error("[play:getCheckpoint] failed", {
      checkpointId: cpId,
      name: e?.name,
      message: e?.message,
      sql: e?.parent?.sql,
      sqlMessage: e?.parent?.message,
    });
    return res.status(500).json({ error: "Failed to load checkpoint" });
  }
});

/* ============================================================================
   POST /api/play/checkpoints/:checkpointId/anchor
   Anchor a checkpoint's coordinates once (tutorial start).
   Preconditions: must be logged in and joined to the hunt (userHuntId).
   Only allowed for first checkpoint (order/sequenceIndex === 1).
   Idempotent: if coords are already set, returns existing coords.
   Optionally: derive CP2/CP3 relative to CP1 the first time CP1 is anchored.
   ========================================================================== */

router.post("/checkpoints/:checkpointId/anchor", requireAuth, async (req, res) => {
  const { checkpointId } = req.params;
  const { lat, lng, userHuntId } = req.body || {};
  const cpId = Number(checkpointId);

  if (!Number.isFinite(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng required" });
  }
  if (!userHuntId) return res.status(400).json({ error: "userHuntId required" });

  const t = await sequelize.transaction();
  try {
    const cp1 = await Checkpoint.findByPk(cpId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!cp1) {
      await t.rollback();
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Gate: only first checkpoint by sequence/order
    const isFirst = (cp1.sequenceIndex ?? cp1.order ?? 0) === 1;
    if (!isFirst) {
      await t.rollback();
      return res.status(400).json({ error: "Only first checkpoint can anchor" });
    }

    // Ensure the user is joined to this hunt
    const uh = await UserHunt.findByPk(userHuntId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!uh || uh.huntId !== cp1.huntId) {
      await t.rollback();
      return res.status(403).json({ error: "Not joined to this hunt" });
    }

    // If already set, no-op
    const already =
      Number.isFinite(cp1.lat) && Number.isFinite(cp1.lng) &&
      (Math.abs(cp1.lat) > 1e-6 || Math.abs(cp1.lng) > 1e-6);

    if (!already) {
      cp1.lat = Number(lat);
      cp1.lng = Number(lng);
      await cp1.save({ transaction: t });

      // OPTIONAL: set CP2/CP3 relative to CP1 if still unset (tutorial convenience)
      const [cp2, cp3] = await Promise.all([
        Checkpoint.findOne({ where: { huntId: cp1.huntId, order: 2 }, transaction: t, lock: t.LOCK.UPDATE }),
        Checkpoint.findOne({ where: { huntId: cp1.huntId, order: 3 }, transaction: t, lock: t.LOCK.UPDATE }),
      ]);

      if (cp2 && !(Number.isFinite(cp2.lat) && Number.isFinite(cp2.lng))) {
        const o2 = offsetMeters(cp1.lat, cp1.lng, 150, 120); // ~190m NE
        cp2.lat = o2.lat; cp2.lng = o2.lng; await cp2.save({ transaction: t });
      }
      if (cp3 && !(Number.isFinite(cp3.lat) && Number.isFinite(cp3.lng))) {
        const o3 = offsetMeters(cp1.lat, cp1.lng, 240, -220); // ~330m NW
        cp3.lat = o3.lat; cp3.lng = o3.lng; await cp3.save({ transaction: t });
      }
    }

    await t.commit();
    return res.json({
      ok: true,
      checkpoint: { id: cp1.id, lat: cp1.lat, lng: cp1.lng },
    });
  } catch (e) {
    await t.rollback();
    console.error("[play:anchor] failed", e);
    return res.status(500).json({ error: "Failed to anchor checkpoint(s)" });
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
       Geofence check (enabled):
       Requires cp.lat/lng and tolerance (either toleranceRadius or tolerance) plus attempt lat/lng.
      */
      if (
        cp.lat != null &&
        cp.lng != null &&
        (cp.toleranceRadius != null || cp.tolerance != null) &&
        lat != null &&
        lng != null
      ) {
        const tol = cp.toleranceRadius ?? cp.tolerance;
        const dist = metersBetween(Number(lat), Number(lng), cp.lat, cp.lng);
        if (Number.isFinite(dist) && Number.isFinite(tol) && dist > tol) {
          await t.rollback();
          return res.status(403).json({
            error: `You are too far from the checkpoint (distance ${Math.round(
              dist
            )}m, must be within ${tol}m)`,
          });
        }
      }

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
