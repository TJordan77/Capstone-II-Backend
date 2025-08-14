const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UserCheckpointProgress = sequelize.define(
  "UserCheckpointProgress",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userHuntId: { type: DataTypes.INTEGER, allowNull: false, field: "user_hunt_id" },
    checkpointId: { type: DataTypes.INTEGER, allowNull: false, field: "checkpoint_id" },
    attemptsCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "attempts_count",
    },
    solvedAt: { type: DataTypes.DATE, allowNull: true, field: "solved_at" },
  },
  {
    tableName: "user_checkpoint_progress",
    indexes: [{ unique: true, fields: ["user_hunt_id", "checkpoint_id"] }],
    timestamps: true, // createdAt = row creation, updatedAt = last attempt
  }
);

module.exports = UserCheckpointProgress;
