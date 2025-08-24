// backend/api/play.js
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
  User,
  Hunt,
} = require("../database");
const { requireAuth } = require("../middleware/authMiddleware");
const { sendHuntCompletion } = require("../util/notify");

// A little answer normalizer
const norm = (s) => (s || "").trim().toLowerCase();

//  Small helpers for attempts, next checkpoints, and progress rows
async function getOrCreateProgress(t, userId, userHuntId, checkpointId) {
  const [row] = await UserCheckpointProgress.findOrCreate({
    where: { userId, userHuntId, checkpointId },
    defaults: {
      userId,
      userHuntId,
      checkpointId,
      attemptsCount: 0,
      solved: false,
      lastAttemptAt: null,
      lat: null,
      lng: null,
    },
    transaction: t,
  });
  return row;
}

async function getFirstCheckpointId(huntId, t) {
  const first = await Checkpoint.findOne({
    where: { huntId },
    order: [["order", "ASC"]],
    transaction: t,
  });
  return first ? first.id : null;
}

async function getNextCheckpointId(currentCp, t) {
  if (!currentCp) return null;
  const next = await Checkpoint.findOne({
    where: { huntId: currentCp.huntId, order: currentCp.order + 1 },
    transaction: t,
  });
  return next ? next.id : null;
}

// GET /api/play/checkpoints/:checkpointId
// Returns lightweight checkpoint info (NO answer).
router.get("/checkpoints/:checkpointId", async (req, res) => {
  const { checkpointId } = req.params;
  const cpId = Number(checkpointId);
  if (!Number.isFinite(cpId) || cpId <= 0) {
    return res.status(400).json({ error: "Invalid checkpointId" });
  }

  try {
    const row = await Checkpoint.findByPk(cpId, {
      attributes: [
        "id",
        "title",
        "riddle",
        "lat",
        "lng",
        "toleranceRadius",
        "sequenceIndex",
        "huntId",
      ],
    });
    if (!row) return res.status(404).json({ error: "Checkpoint not found" });

    const toleranceRadius = row.toleranceRadius ?? row.tolerance_radius ?? null;
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
    console.error("GET /play/checkpoints/:checkpointId failed", e);
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
    const cpX = await Checkpoint.findByPk(cpId, { transaction: t });
    if (!cpX) {
      await t.rollback();
      return res.status(404).json({ error: "Checkpoint not found" });
    }

    const huntId = cpX.huntId;
    const cps = await Checkpoint.findAll({
      where: { huntId },
      order: [["order", "ASC"]],
      transaction: t,
    });

    if (!cps || cps.length === 0) {
      await t.rollback();
      return res.status(404).json({ error: "No checkpoints in this hunt" });
    }

    const c1 = cps[0];
    const dist = (a, b) => {
      const toRad = (x) => (x * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
      const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
      const A =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat ?? 0)) *
          Math.cos(toRad(b.lat ?? 0)) *
          Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(A));
    };

    const farFromC1 =
      !Number.isFinite(c1?.lat) || !Number.isFinite(c1?.lng)
        ? true
        : dist({ lat, lng }, { lat: c1.lat, lng: c1.lng }) > THRESHOLD;

    if (farFromC1 || force) {
      c1.lat = lat;
      c1.lng = lng;
      await c1.save({ transaction: t });
    }

    const c2 = cps[1];
    const c3 = cps[2];
    const needNeighbors =
      (c2 &&
        (typeof c2.lat !== "number" ||
          typeof c2.lng !== "number" ||
          dist({ lat, lng }, { lat: c2.lat, lng: c2.lng }) > NEIGHBOR_THRESHOLD)) ||
      (c3 &&
        (typeof c3.lat !== "number" ||
          typeof c3.lng !== "number" ||
          dist({ lat, lng }, { lat: c3.lat, lng: c3.lng }) > NEIGHBOR_THRESHOLD));

    if (needNeighbors || forceNeighbors) {
      if (c2) {
        c2.lat = lat + 0.0009;
        c2.lng = lng + 0.0009;
        await c2.save({ transaction: t });
      }
      if (c3) {
        c3.lat = lat + 0.0018;
        c3.lng = lng + 0.0018;
        await c3.save({ transaction: t });
      }
    }

    // Track that user anchored near here, non-critical
    try {
      const uh = await UserHunt.findByPk(userHuntId, { transaction: t });
      if (uh) {
        const p = await getOrCreateProgress(t, uh.userId, uh.id, c1.id);
        p.lastAttemptAt = new Date();
        p.lat = lat;
        p.lng = lng;
        await p.save({ transaction: t });
      }
    } catch (e) {
      // non-blocking
    }

    await t.commit();
    return res.json({ ok: true });
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
    const { answer, lat, lng, userHuntId } = req.body || {};

    const cpId = Number(checkpointId);
    if (!Number.isFinite(cpId) || cpId <= 0) {
      return res.status(400).json({ error: "Invalid checkpointId" });
    }
    if (!userHuntId) {
      return res.status(400).json({ error: "userHuntId required" });
    }

    const t = await sequelize.transaction();
    try {
      const cp = await Checkpoint.findByPk(cpId, { transaction: t });
      if (!cp) {
        await t.rollback();
        return res.status(404).json({ error: "Checkpoint not found" });
      }

      const uh = await UserHunt.findByPk(userHuntId, { transaction: t });
      if (!uh) {
        await t.rollback();
        return res.status(404).json({ error: "UserHunt not found" });
      }

      // Ensure startedAt is set
      if (!uh.startedAt) {
        uh.startedAt = new Date();
        await uh.save({ transaction: t });
      }

      const progress = await getOrCreateProgress(t, uh.userId, uh.id, cp.id);

      // Max attempts guard (if configured)
      if (cp.maxAttempts && progress.attemptsCount >= cp.maxAttempts) {
        await t.rollback();
        return res.status(429).json({ error: "No attempts remaining" });
      }

      // Record attempt row (auditable)
      await CheckpointAttempt.create(
        {
          userId: uh.userId,
          userHuntId: uh.id,
          checkpointId: cp.id,
          submittedAnswer: answer || "",
          lat: Number.isFinite(lat) ? lat : null,
          lng: Number.isFinite(lng) ? lng : null,
          createdAt: new Date(),
        },
        { transaction: t }
      );

      // Validate answer
      const wasCorrect = norm(answer) && norm(answer) === norm(cp.answer);

      // Update progress
      progress.attemptsCount = (progress.attemptsCount || 0) + 1;
      progress.lastAttemptAt = new Date();
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        progress.lat = lat;
        progress.lng = lng;
      }
      if (wasCorrect) progress.solved = true;

      // If correct, grant checkpoint badges (if any)
      if (wasCorrect) {
        try {
          const checkpointBadges = await Badge.findAll({
            where: { checkpointId: cp.id },
            transaction: t,
          });
          for (const b of checkpointBadges) {
            await UserBadge.findOrCreate({
              where: { userId: uh.userId, badgeId: b.id },
              defaults: { userId: uh.userId, badgeId: b.id },
              transaction: t,
            });
          }
        } catch (e) {
          console.warn("Checkpoint badge grant failed (non-blocking):", e?.message || e);
        }
      }

      await progress.save({ transaction: t });

      let nextCheckpointId = null;
      if (wasCorrect) {
        nextCheckpointId = await getNextCheckpointId(cp, t);

        if (!nextCheckpointId) {
          // Hunt completed
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
            // Derived badges on completion (Pathfinder, Speedrunner, Badge Collector)
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

      // Notify player and creator on hunt completion
      if (wasCorrect && !nextCheckpointId) {
        try {
          const [player, hunt] = await Promise.all([
            User.findByPk(uh.userId, { transaction: t }),
            Hunt.findByPk(cp.huntId, { include: [{ model: User, as: "creator" }], transaction: t }),
          ]);
          if (player && hunt) {
            await sendHuntCompletion({ user: player, hunt, userHunt: uh });
          }
        } catch (e) {
          console.warn("Hunt completion notification failed:", e?.message || e);
        }
      }

      // SMS when player is near the next checkpoint
      try {
        if (nextCheckpointId && Number.isFinite(lat) && Number.isFinite(lng)) {
          const nextCp = await Checkpoint.findByPk(nextCheckpointId, { transaction: t });
          const user = await User.findByPk(uh.userId, { transaction: t });
          const to = user && user.phone ? user.phone : null;
          const meters = process.env.SMS_NEAR_METERS ? parseInt(process.env.SMS_NEAR_METERS, 10) : 50;

          function toRad(x){ return (x * Math.PI) / 180; }
          function haversine(aLat, aLng, bLat, bLng) {
            const R = 6371000;
            const dLat = toRad(bLat - aLat);
            const dLng = toRad(bLng - aLng);
            const A = Math.sin(dLat/2)**2 + Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLng/2)**2;
            return 2 * R * Math.asin(Math.sqrt(A));
          }

          if (nextCp && to && Number.isFinite(nextCp.lat) && Number.isFinite(nextCp.lng)) {
            const dist = haversine(lat, lng, nextCp.lat, nextCp.lng);
            if (dist <= meters) {
              const { sendSMS, logNotification } = require("../util/notify");
              const resp = await sendSMS({ to, body: "You are near the next SideQuest checkpoint. Open the app to continue!" });
              await logNotification({ userId: uh.userId, type: "sms", template: "near_next_checkpoint", status: resp.ok ? "sent" : "failed", error: resp.error });
            }
          }
        }
      } catch (e) {
        console.warn("Optional SMS near-next-checkpoint failed:", e?.message || e);
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
