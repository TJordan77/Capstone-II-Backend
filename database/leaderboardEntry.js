const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const LeaderboardEntry = sequelize.define(
  "LeaderboardEntry",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    badges_collected: DataTypes.INTEGER,
    completion_time_seconds: DataTypes.INTEGER,
    rank: DataTypes.INTEGER,
    recorded_at: DataTypes.DATE,
  },
  {
    tableName: "leaderboard_entries",
    timestamps: false,
  }
);

module.exports = LeaderboardEntry;
