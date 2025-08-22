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
   ========================================================================== */
router.get("/checkpoints/:checkpointId", async (req, res) => {
  const { checkpointId } = req.params;
  const cpId = Number(checkpointId);
  if (!Number.isInteger(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }

  try {
    const cp = await Checkpoint.findByPk(cpId);
    if (!cp) return res.status(404).json({ error: "Checkpoint not found" });

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
   Anchor (or re-anchor) Tutorial CP1 to the player's current GPS.
   Updates if coords are missing OR distance > THRESHOLD OR force===true.
   Idempotent otherwise. Also nudges CP2/CP3 once if unset (tutorial convenience).
   ========================================================================== */
router.post("/checkpoints/:checkpointId/anchor", requireAuth, async (req, res) => {
  const { checkpointId } = req.params;
  const { lat, lng, userHuntId, force } = req.body || {};
  const cpId = Number(checkpointId);

  if (!Number.isFinite(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng required" });
  }
  if (!userHuntId) return res.status(400).json({ error: "userHuntId required" });

  const THRESHOLD = 500; // meters – re-anchor if old CP1 is farther than this from the player's GPS

  const t = await sequelize.transaction();
  try {
    const cp1 = await Checkpoint.findByPk(cpId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!cp1) {
      await t.rollback();
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    // Only allow first checkpoint (order/sequenceIndex === 1)
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

    const hadCoords =
      Number.isFinite(cp1.lat) && Number.isFinite(cp1.lng);
    const prev = hadCoords ? { lat: cp1.lat, lng: cp1.lng } : null;

    let shouldUpdate = !hadCoords || Boolean(force);
    if (!shouldUpdate && hadCoords) {
      const d = metersBetween(Number(lat), Number(lng), cp1.lat, cp1.lng);
      if (Number.isFinite(d) && d > THRESHOLD) {
        shouldUpdate = true;
      }
    }

    if (shouldUpdate) {
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

      await t.commit();
      return res.json({
        ok: true,
        updated: true,
        previous: prev,
        checkpoint: { id: cp1.id, lat: cp1.lat, lng: cp1.lng },
      });
    }

    // No update performed
    await t.commit();
    return res.json({
      ok: true,
      updated: false,
      previous: prev,
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

      // Evaluate correctness
      const wasCorrect = norm(answer) === norm(cp.answer);

      // Geofence check (enabled)
      if (
        cp.lat != null &&
        cp.lng != null &&
        (cp.toleranceRadius != null || cp.tolerance != null) &&
        lat != null &&
        lng != null
      ) {
        const tol = Number(cp.toleranceRadius ?? cp.tolerance);
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
          wasCorrect,
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

            const pf = await Badge.findOne({ where: { title: "Pathfinder" }, transaction: t });
            if (pf) {
              await UserBadge.findOrCreate({
                where: { userId, badgeId: pf.id },
                defaults: { userId, badgeId: pf.id },
                transaction: t,
              });
            }

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
          } catch (e) {
            console.warn("Derived badge grant failed (non-blocking):", e?.message || e);
          }
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
        badge: null,
      });
    } catch (err) {
      await t.rollback();
      console.error("submit attempt failed", err);
      return res.status(500).json({ error: "Failed to submit attempt" });
    }
  }
);

module.exports = router;
