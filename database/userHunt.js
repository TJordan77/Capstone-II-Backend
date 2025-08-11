const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UserHunt = sequelize.define(
  "UserHunt",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    startedAt: { type: DataTypes.DATE, field: "started_at" },
    completedAt: { type: DataTypes.DATE, field: "completed_at" },
    status: { type: DataTypes.STRING }, // 'active', 'completed', 'abandoned'
    totalBadges: { type: DataTypes.INTEGER, field: "total_badges" },
    totalTimeSeconds: { type: DataTypes.INTEGER, field: "total_time_seconds" },
  },
  {
    tableName: "user_hunts",
    timestamps: false,
    indexes: [{ unique: true, fields: ["user_id", "hunt_id"] }],
  }
);

module.exports = UserHunt;
