// Smedly's Logic for Leaderboard (with LeaderboardEntry + fallback to UserHunt)
const express = require("express");
const router = express.Router();

// Make sure these are exported from database/index.js
const { LeaderboardEntry, UserHunt, User } = require("../database");

/**
   Normalize a LeaderboardEntry row to the target shape.
   Handles possible field name variations:
    - completionTime | totalTimeSeconds
    - completionDate | completedAt
 */
function mapFromLeaderboardEntry(r) {
  // prefer explicit fields if present, otherwise fall back
  const time =
    r.completionTime ??
    r.totalTimeSeconds ??
    null;

  const date =
    r.completionDate ??
    r.completedAt ??
    null;

  return {
    id: r.id,
    completionTime: time,
    completionDate: date ? new Date(date).toISOString() : null,
    User: {
      username: r.User?.username || "Unknown",
    },
  };
}

/**
  Normalize a UserHunt row to the target shape.
  Derives completionTime from startedAt/completedAt if totalTimeSeconds is null.
 */
function mapFromUserHunt(r) {
  let completionTime = r.totalTimeSeconds;
  if (
    (completionTime == null || Number.isNaN(completionTime)) &&
    r.startedAt &&
    r.completedAt
  ) {
    completionTime = Math.max(
      0,
      Math.round((new Date(r.completedAt) - new Date(r.startedAt)) / 1000)
    );
  }

  return {
    id: r.id,
    completionTime: completionTime ?? null,
    completionDate: r.completedAt ? new Date(r.completedAt).toISOString() : null,
    User: {
      username: r.User?.username || "Unknown",
    },
  };
}

/*
  GET /api/hunts/:huntId/leaderboard
  1) Try pulling precomputed rows from LeaderboardEntry (preferred).
  2) If none found, fall back to computing from UserHunt.
 */
router.get("/:huntId", async (req, res) => {
  const huntId = Number(req.params.huntId);
  if (!Number.isInteger(huntId) || huntId <= 0) {
    return res.status(400).json({ error: "Invalid huntId" });
  }

  try {
    //Preferred source: LeaderboardEntry (double check if we're using this)
    let entries = [];
    if (LeaderboardEntry) {
      const rows = await LeaderboardEntry.findAll({
        where: { huntId },
        include: [{ model: User, attributes: ["username"] }],
        // Being generous with attribute names in case model differs
        attributes: [
          "id",
          "completionTime",
          "completionDate",
          "totalTimeSeconds",
          "completedAt",
        ],
        order: [
          // prefer completionTime/totalTimeSeconds ASC, then completionDate/completedAt ASC
          ["completionTime", "ASC"],
          ["totalTimeSeconds", "ASC"],
          ["completionDate", "ASC"],
          ["completedAt", "ASC"],
        ],
        limit: 100,
      });

      entries = rows.map(mapFromLeaderboardEntry).filter((e) => e.completionTime != null);
    }

    // If we got entries, return them
    if (entries.length > 0) {
      return res.json(entries);
    }

    // Fallback: derive from UserHunt if no LeaderboardEntry rows present
    const uhRows = await UserHunt.findAll({
      where: { huntId },
      include: [{ model: User, attributes: ["username"], required: false }],
      attributes: [
        "id",
        "startedAt",
        "completedAt",
        "totalTimeSeconds",
        "status",
        "totalBadges",
      ],
      order: [
        ["totalTimeSeconds", "ASC"],
        ["completedAt", "ASC"],
      ],
      limit: 100,
    });

    const data = uhRows
      .filter((r) => r.completedAt != null || r.status === "completed")
      .map(mapFromUserHunt)
      // ensure null times sink to the bottom if any slipped through
      .sort((a, b) => {
        if (a.completionTime == null && b.completionTime == null) return 0;
        if (a.completionTime == null) return 1;
        if (b.completionTime == null) return -1;
        return a.completionTime - b.completionTime;
      });

    return res.json(data);
  } catch (err) {
    console.error("GET /api/hunts/:huntId/leaderboard failed:", err);
    return res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

module.exports = router;
