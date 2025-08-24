/**
  Why did I add this? So we can have routes for creator dashboards & stats.
 
  Endpoints:
   - GET /api/creators/:creatorId/stats
   - GET /api/creators/:creatorId/hunts
   - GET /api/creators/:creatorId/overview
 
  Notes:
   - "Active Players" = distinct users joined to any of this creator's *active* hunts
     via UserHunt (may change tables if this doeesn't work out well).
   - "Completed Hunts" = creator hunts where isActive === false OR endsAt <= now().
   - Hunts response includes playersCount per hunt and normalized isActive.
 */

const router = require("express").Router();
const { Op } = require("sequelize");

// Pull models from central db index.
const { sequelize, Hunt, UserHunt, User, UserBadge } = require("../database");

// May add middleware in since this is tied to certain users for view
// const { requireAuth } = require("../middleware/authMiddleware");

// Normalize active/inactive using either explicit isActive or endsAt date. 
function computeIsActive(hunt, now = new Date()) {
  if (typeof hunt.isActive === "boolean") return hunt.isActive;
  if (hunt.endsAt instanceof Date) return hunt.endsAt > now;
  return true; // default to active if unspecified
}

// GET /api/creators/:creatorId/stats
router.get("/:creatorId/stats", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;
  try {
    const total = await Hunt.count({ where: { creatorId } });

    // Active players = distinct users joined across active hunts
    const hunts = await Hunt.findAll({
      where: { creatorId },
      attributes: ["id", "isActive", "endsAt"],
    });

    const now = new Date();
    const activeHuntIds = hunts
      .filter((h) => computeIsActive(h, now))
      .map((h) => h.id);

    let activePlayers = 0;
    if (activeHuntIds.length > 0) {
      const distinct = await UserHunt.findAll({
        attributes: ["userId"],
        where: { huntId: activeHuntIds },
        group: ["userId"],
      });
      activePlayers = distinct.length;
    }

    const completed = hunts.filter((h) => !computeIsActive(h, now)).length;

    res.json({ total, activePlayers, completed });
  } catch (err) {
    console.error("GET /creators/:creatorId/stats error:", err);
    res.status(500).json({ error: "Failed to compute creator stats" });
  }
});

/* GET /api/creators/:creatorId/hunts
   Returns an array of hunts with { id, title, description, isActive, playersCount }
   Query params (optional):
     - limit (default 50)
     - offset (default 0)
 */
router.get("/:creatorId/hunts", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

  try {
    const hunts = await Hunt.findAll({
      where: { creatorId },
      order: [["updatedAt", "DESC"]],
      attributes: ["id", "title", "description", "isActive", "endsAt"],
      limit,
      offset,
    });

    const ids = hunts.map((h) => h.id);
    const countsById = await getPlayersCountByHunt(ids);

    const total = await Hunt.count({ where: { creatorId } });
    const now = new Date();

    const stats = {
      total,
      active: hunts.filter((h) => computeIsActive(h, now)).length,
      inactive: hunts.filter((h) => !computeIsActive(h, now)).length,
    };

    const huntsPayload = hunts.map((h) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      isActive: computeIsActive(h, now),
      playersCount: countsById[h.id] || 0,
    }));

    res.json({ stats, hunts: huntsPayload });
  } catch (err) {
    console.error("GET /creators/:creatorId/hunts error:", err);
    res.status(500).json({ error: "Failed to load hunts" });
  }
});

/* GET /api/creators/:creatorId/overview
   returns { stats, hunts } where stats is same as /stats and hunts is the first 25
*/
router.get("/:creatorId/overview", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;
  try {
    const total = await Hunt.count({ where: { creatorId } });

    const hunts = await Hunt.findAll({
      where: { creatorId },
      attributes: ["id", "title", "description", "isActive", "endsAt"],
      order: [["updatedAt", "DESC"]],
      limit: 25,
    });

    const ids = hunts.map((h) => h.id);
    const countsById = await getPlayersCountByHunt(ids);

    const now = new Date();
    const stats = {
      total,
      active: hunts.filter((h) => computeIsActive(h, now)).length,
      completed: hunts.filter((h) => !computeIsActive(h, now)).length,
    };

    const huntsPayload = hunts.map((h) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      isActive: computeIsActive(h, now),
      playersCount: countsById[h.id] || 0,
    }));

    res.json({ stats, hunts: huntsPayload });
  } catch (err) {
    console.error("GET /creators/:creatorId/overview error:", err);
    res.status(500).json({ error: "Failed to load creator overview" });
  }
});

async function getPlayersCountByHunt(huntIds) {
  if (!huntIds || huntIds.length === 0) return {};
  const rows = await UserHunt.findAll({
    attributes: ["huntId", [sequelize.fn("COUNT", sequelize.col("id")), "cnt"]],
    where: { huntId: huntIds },
    group: ["huntId"],
  });
  const map = {};
  for (const r of rows) {
    map[r.huntId] = parseInt(r.get("cnt"), 10);
  }
  return map;
}

/* GET /api/creators/:creatorId/completions
   Returns recent hunt completions for this creator's hunts
   Response shape: [{ username, userId, huntId, huntTitle, completedAt, totalTimeSeconds, badgesCount }]
*/
router.get("/:creatorId/completions", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "25", 10), 100);
  try {
    const hunts = await Hunt.findAll({ where: { creatorId }, attributes: ["id", "title"] });
    const byId = new Map(hunts.map(h => [h.id, h]));
    const huntIds = hunts.map(h => h.id);
    if (huntIds.length === 0) return res.json([]);

    const rows = await UserHunt.findAll({
      where: { huntId: huntIds, status: "completed" },
      order: [["completedAt","DESC"]],
      limit,
      include: [{ model: User, as: "user", attributes: ["id","username","email"] }],
    });

    const out = await Promise.all(rows.map(async (r) => {
      // badges count for this user
      const badgesCount = await UserBadge.count({ where: { userId: r.userId } });
      const h = byId.get(r.huntId);
      return {
        username: r.user?.username || `User ${r.userId}`,
        userId: r.userId,
        huntId: r.huntId,
        huntTitle: h?.title || `Hunt ${r.huntId}`,
        completedAt: r.completedAt,
        totalTimeSeconds: r.totalTimeSeconds,
        badgesCount,
      };
    }));

    res.json(out);
  } catch (e) {
    console.error("GET /api/creators/:creatorId/completions failed:", e);
    res.status(500).json({ error: "Failed to load completions" });
  }
});

module.exports = router;
