const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const LeaderboardEntry = sequelize.define(
  "LeaderboardEntry",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    badgesCollected: { type: DataTypes.INTEGER, field: "badges_collected" },
    completionTimeSeconds: { type: DataTypes.INTEGER, field: "completion_time_seconds" },
    rank: { type: DataTypes.INTEGER },
    recordedAt: { type: DataTypes.DATE, field: "recorded_at" },
  },
  {
    tableName: "leaderboard_entries",
    timestamps: false,
    indexes: [
      { fields: ["hunt_id"] },
      { fields: ["user_id"] },
      // uncomment if one row per user per hunt
      // { unique: true, fields: ["hunt_id", "user_id"] },
    ],
  }
);

module.exports = LeaderboardEntry;
