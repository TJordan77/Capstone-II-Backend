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
const { sequelize, Hunt, UserHunt } = require("../database");

// May add middleware in since this is tied to certain users for view
// const { requireAuth } = require("../middleware/authMiddleware");

// Normalize active/inactive using either explicit isActive or endsAt date. 
function computeIsActive(hunt, now = new Date()) {
  if (typeof hunt.isActive === "boolean") return hunt.isActive;
  if (hunt.endsAt instanceof Date) return hunt.endsAt > now;
  return true; // default to active if unspecified
}

// Get active hunt ids for a creator.
async function getActiveHuntIdsForCreator(creatorId) {
  const activeHunts = await Hunt.findAll({
    where: {
      creatorId,
      [Op.or]: [{ isActive: true }, { endsAt: { [Op.gt]: new Date() } }],
    },
    attributes: ["id"],
  });
  return activeHunts.map((h) => h.id);
}

// Players count per huntId using UserHunt.
// Swap the SQL if your table is different (example provided below).
async function getPlayersCountByHunt(huntIds) {
  if (!huntIds.length) return {};

  // Using UserHunt (userId, huntId)
  const [rows] = await sequelize.query(
    `
    SELECT "huntId", COUNT(DISTINCT "userId")::int AS players
    FROM "UserHunts"
    WHERE "huntId" = ANY(:ids)
    GROUP BY "huntId"
    `,
    { replacements: { ids: huntIds } }
  );

  /* In case LeaderboardEntry is better:
    const [rows] = await sequelize.query(
      `
      SELECT "huntId", COUNT(DISTINCT "userId")::int AS players
      FROM "LeaderboardEntries"
      WHERE "huntId" = ANY(:ids)
      GROUP BY "huntId"
      `,
      { replacements: { ids: huntIds } }
    );

    return rows.reduce((acc, r) => {
      acc[r.huntId] = r.players;
      return acc;
    }, {});
  */

  // return the UserHunt-based counts by default
  return rows.reduce((acc, r) => {
    acc[r.huntId] = r.players;
    return acc;
  }, {});
}

// GET /api/creators/:creatorId/stats
//  Returns { total, activePlayers, completed }
router.get("/:creatorId/stats", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;

  try {
    // Total hunts authored by creator
    const total = await Hunt.count({ where: { creatorId } });

    // Active hunts authored by creator
    const activeIds = await getActiveHuntIdsForCreator(creatorId);

    // Distinct players across active hunts (via UserHunt)
    let activePlayers = 0;
    if (activeIds.length) {
      const [rowset] = await sequelize.query(
        `
        SELECT COUNT(DISTINCT "userId")::int AS count
        FROM "UserHunts"
        WHERE "huntId" = ANY(:ids)
        `,
        { replacements: { ids: activeIds } }
      );
      activePlayers = rowset?.[0]?.count || 0;
    }

    // Completed hunts: not active (explicit false or ended in the past)
    const completed = await Hunt.count({
      where: {
        creatorId,
        [Op.or]: [{ isActive: false }, { endsAt: { [Op.lte]: new Date() } }],
      },
    });

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
    const now = new Date();

    const payload = hunts.map((h) => ({
      id: h.id,
      title: h.title,
      description: h.description,
      isActive: computeIsActive(h, now),
      playersCount: countsById[h.id] || 0,
    }));

    res.json(payload);
  } catch (err) {
    console.error("GET /creators/:creatorId/hunts error:", err);
    res.status(500).json({ error: "Failed to load creator hunts" });
  }
});

/* GET /api/creators/:creatorId/overview
   Convenience endpoint: { stats, hunts }
   Accepts same pagination params as /hunts
 */
router.get("/:creatorId/overview", /* requireAuth, */ async (req, res) => {
  const { creatorId } = req.params;
  const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);

  try {
    // Stats
    const total = await Hunt.count({ where: { creatorId } });
    const activeIds = await getActiveHuntIdsForCreator(creatorId);

    let activePlayers = 0;
    if (activeIds.length) {
      const [rowset] = await sequelize.query(
        `
        SELECT COUNT(DISTINCT "userId")::int AS count
        FROM "UserHunts"
        WHERE "huntId" = ANY(:ids)
        `,
        { replacements: { ids: activeIds } }
      );
      activePlayers = rowset?.[0]?.count || 0;
    }

    const completed = await Hunt.count({
      where: {
        creatorId,
        [Op.or]: [{ isActive: false }, { endsAt: { [Op.lte]: new Date() } }],
      },
    });

    const stats = { total, activePlayers, completed };

    // Hunts
    const hunts = await Hunt.findAll({
      where: { creatorId },
      order: [["updatedAt", "DESC"]],
      attributes: ["id", "title", "description", "isActive", "endsAt"],
      limit,
      offset,
    });

    const ids = hunts.map((h) => h.id);
    const countsById = await getPlayersCountByHunt(ids);
    const now = new Date();

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

module.exports = router;
