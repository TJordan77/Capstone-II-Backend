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
const { Op } = require("sequelize"); // For lookups

// A little answer normalizer
const norm = (s) => (s || "").trim().toLowerCase();

// Optional geofence helper (meters). Uses a simple flat-earth approx good enough for small radii.
function metersBetween(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * 111111;
  const dLng =
    (lng2 - lng1) * 111111 * Math.cos((((lat1 + lat2) / 2) * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
}

// Simple meter offsets: (northMeters, eastMeters) from a base lat/lng
function offsetMeters(lat, lng, northMeters, eastMeters) {
  const dLat = northMeters / 111111;
  const dLng = eastMeters / (111111 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

// Resolve a userId from req or, if missing, via the UserHunt row
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
   Returns lightweight checkpoint info (NO answer).
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
   Rebase the tutorial around the player's GPS.
   - Works when called from ANY checkpoint in the hunt (CP1/CP2/CP3).
   - Updates CP1 if missing / far / force.
   - Updates CP2 & CP3 if far / forceNeighbors (or if unset).
   ========================================================================== */
router.post("/checkpoints/:checkpointId/anchor", requireAuth, async (req, res) => {
  const { checkpointId } = req.params;
  const { lat, lng, userHuntId, force, forceNeighbors } = req.body || {};
  const cpId = Number(checkpointId);

  if (!Number.isFinite(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "lat/lng required" });
  }
  if (!userHuntId) return res.status(400).json({ error: "userHuntId required" });

  const THRESHOLD = 500;           // re-anchor CP1 if farther than this
  const NEIGHBOR_THRESHOLD = 800;  // rebase CP2/3 if farther than this

  const t = await sequelize.transaction();
  try {
    const cpX = await Checkpoint.findByPk(cpId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!cpX) {
      await t.rollback();
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    const uh = await UserHunt.findByPk(userHuntId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!uh || uh.huntId !== cpX.huntId) {
      await t.rollback();
      return res.status(403).json({ error: "Not joined to this hunt" });
    }

    // Find the first CP for this hunt (order/sequenceIndex = 1)
    const cp1 =
      (await Checkpoint.findOne({
        where: { huntId: cpX.huntId, order: 1 },
        transaction: t, lock: t.LOCK.UPDATE,
      })) ||
      (await Checkpoint.findOne({
        where: { huntId: cpX.huntId, sequenceIndex: 1 },
        transaction: t, lock: t.LOCK.UPDATE,
      }));

    if (!cp1) {
      await t.rollback();
      return res.status(400).json({ error: "Hunt missing first checkpoint" });
    }

    const hadCoords = Number.isFinite(cp1.lat) && Number.isFinite(cp1.lng);
    const prev = hadCoords ? { lat: cp1.lat, lng: cp1.lng } : null;

    let updateCp1 = !hadCoords || Boolean(force);
    if (!updateCp1 && hadCoords) {
      const d = metersBetween(Number(lat), Number(lng), cp1.lat, cp1.lng);
      if (Number.isFinite(d) && d > THRESHOLD) updateCp1 = true;
    }

    if (updateCp1) {
      cp1.lat = Number(lat);
      cp1.lng = Number(lng);
      await cp1.save({ transaction: t });
    }

    // CP2 & CP3 handling (offsets from CP1)
    const [cp2, cp3] = await Promise.all([
      Checkpoint.findOne({ where: { huntId: cp1.huntId, order: 2 }, transaction: t, lock: t.LOCK.UPDATE }),
      Checkpoint.findOne({ where: { huntId: cp1.huntId, order: 3 }, transaction: t, lock: t.LOCK.UPDATE }),
    ]);

    let updatedNeighbors = false;

    if (cp2) {
      const cp2Has = Number.isFinite(cp2.lat) && Number.isFinite(cp2.lng);
      let rebase = !cp2Has || Boolean(forceNeighbors);
      if (!rebase && cp2Has) {
        const d2 = metersBetween(cp1.lat, cp1.lng, cp2.lat, cp2.lng);
        if (Number.isFinite(d2) && d2 > NEIGHBOR_THRESHOLD) rebase = true;
      }
      if (rebase) {
        const o2 = offsetMeters(cp1.lat, cp1.lng, 150, 120); // ~190m NE
        cp2.lat = o2.lat; cp2.lng = o2.lng;
        await cp2.save({ transaction: t });
        updatedNeighbors = true;
      }
    }

    if (cp3) {
      const cp3Has = Number.isFinite(cp3.lat) && Number.isFinite(cp3.lng);
      let rebase = !cp3Has || Boolean(forceNeighbors);
      if (!rebase && cp3Has) {
        const d3 = metersBetween(cp1.lat, cp1.lng, cp3.lat, cp3.lng);
        if (Number.isFinite(d3) && d3 > NEIGHBOR_THRESHOLD) rebase = true;
      }
      if (rebase) {
        const o3 = offsetMeters(cp1.lat, cp1.lng, 240, -220); // ~330m NW
        cp3.lat = o3.lat; cp3.lng = o3.lng;
        await cp3.save({ transaction: t });
        updatedNeighbors = true;
      }
    }

    await t.commit();
    return res.json({
      ok: true,
      updated: Boolean(updateCp1 || updatedNeighbors),
      previous: prev,
      checkpoint: { id: cp1.id, lat: cp1.lat, lng: cp1.lng },
      neighborsUpdated: updatedNeighbors,
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

    const cpId = Number(checkpointId);
    if (!Number.isInteger(cpId) || cpId <= 0) {
      return res.status(400).json({ error: "Invalid checkpointId" });
    }
    if (typeof answer !== "string" || answer.trim() === "") {
      return res.status(400).json({ error: "answer is required" });
    }

    const t = await sequelize.transaction();
    try {
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

      if (uh.huntId !== cp.huntId) {
        await t.rollback();
        return res
          .status(400)
          .json({ error: "Checkpoint does not belong to this hunt" });
      }

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

      if (cp.maxAttempts && progress.attemptsCount >= cp.maxAttempts) {
        await t.rollback();
        return res
          .status(403)
          .json({ error: "Attempt limit reached for this checkpoint" });
      }

      const wasCorrect = norm(answer) === norm(cp.answer);

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

      progress.attemptsCount += 1;

      // Detect first-time solve for this user/checkpoint
      const wasFirstSolve = wasCorrect && !progress.solvedAt; // before we set it

      if (wasCorrect && !progress.solvedAt) {
        progress.solvedAt = new Date();
      }

      // Awarded badges accumulator (returned to client)
      const awardedBadges = [];

      // Grant checkpoint-specific badge(s) on first correct solve
      if (wasFirstSolve) {
        try {
          const checkpointBadges = await Badge.findAll({
            where: { checkpointId: cp.id },
            transaction: t,
          });
          for (const b of checkpointBadges) {
            const [, created] = await UserBadge.findOrCreate({
              where: { userId: uh.userId, badgeId: b.id },
              defaults: { userId: uh.userId, badgeId: b.id, earnedAt: new Date() },
              transaction: t,
            });
            if (created) awardedBadges.push({ badgeId: b.id, reason: "checkpoint" });
          }
        } catch (e) {
          console.warn("Checkpoint badge grant failed (non-blocking):", e?.message || e);
        }
      }

      // Award Trailblazer for the user's FIRST solved checkpoint IN THIS HUNT
      if (wasFirstSolve) {
        try {
          const solvedBeforeInThisHunt = await UserCheckpointProgress.count({
            where: {
              userHuntId: uh.id,
              solvedAt: { [Op.ne]: null },
            },
            transaction: t,
          });
          if (solvedBeforeInThisHunt === 0) {
            const trail = await Badge.findOne({
              where: {
                [Op.or]: [
                  { name: "Trailblazer" },
                  { title: "Trailblazer" },
                  { slug: "trailblazer" },
                  { code: "trailblazer" },
                ],
              },
              transaction: t,
            });
            if (trail) {
              const [, created] = await UserBadge.findOrCreate({
                where: { userId: uh.userId, badgeId: trail.id },
                defaults: { userId: uh.userId, badgeId: trail.id, earnedAt: new Date() },
                transaction: t,
              });
              if (created) awardedBadges.push({ badgeId: trail.id, reason: "first_checkpoint" });
            }
          }
        } catch (e) {
          console.warn("Trailblazer grant failed (non-blocking):", e?.message || e);
        }
      }

      await progress.save({ transaction: t });

      let nextCheckpointId = null;
      if (wasCorrect) {
        nextCheckpointId = await getNextCheckpointId(cp, t);

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

          try {
            const userId = uh.userId;

            const pf = await Badge.findOne({
              where: {
                [Op.or]: [
                  { name: "Pathfinder" },
                  { title: "Pathfinder" },
                  { slug: "pathfinder" },
                  { code: "pathfinder" },
                ],
              },
              transaction: t,
            });
            if (pf) {
              const [, created] = await UserBadge.findOrCreate({
                where: { userId, badgeId: pf.id },
                defaults: { userId, badgeId: pf.id, earnedAt: new Date() },
                transaction: t,
              });
              if (created) awardedBadges.push({ badgeId: pf.id, reason: "hunt_completed" });
            }

            const SPEEDRUN_SECS = 30 * 60;
            if (uh.totalTimeSeconds != null && uh.totalTimeSeconds <= SPEEDRUN_SECS) {
              const sr = await Badge.findOne({
                where: {
                  [Op.or]: [
                    { name: "Speedrunner" },
                    { title: "Speedrunner" },
                    { slug: "speedrunner" },
                    { code: "speedrunner" },
                  ],
                },
                transaction: t,
              });
              if (sr) {
                const [, created] = await UserBadge.findOrCreate({
                  where: { userId, badgeId: sr.id },
                  defaults: { userId, badgeId: sr.id, earnedAt: new Date() },
                  transaction: t,
                });
                if (created) awardedBadges.push({ badgeId: sr.id, reason: "speedrun" });
              }
            }

            const count = await UserBadge.count({ where: { userId }, transaction: t });
            if (count >= 5) {
              const bc = await Badge.findOne({
                where: {
                  [Op.or]: [
                    { name: "Badge Collector" },
                    { title: "Badge Collector" },
                    { slug: "badge-collector" },
                    { code: "badge-collector" },
                  ],
                },
                transaction: t,
              });
              if (bc) {
                const [, created] = await UserBadge.findOrCreate({
                  where: { userId, badgeId: bc.id },
                  defaults: { userId, badgeId: bc.id, earnedAt: new Date() },
                  transaction: t,
                });
                if (created) awardedBadges.push({ badgeId: bc.id, reason: "collection_threshold" });
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
        awardedBadges, // client popup hook
      });
    } catch (err) {
      await t.rollback();
      console.error("submit attempt failed", err);
      return res.status(500).json({ error: "Failed to submit attempt" });
    }
  }
);

module.exports = router;
