const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const CheckpointAttempt = sequelize.define(
  "CheckpointAttempt",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    userHuntId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "user_hunt_id",
    },

    checkpointId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "checkpoint_id",
    },

    reachedAt: { type: DataTypes.DATE, field: "reached_at" },
    riddleAnswer: { type: DataTypes.TEXT, field: "riddle_answer" },
    wasCorrect: { type: DataTypes.BOOLEAN, field: "was_correct" },
    badgeEarned: { type: DataTypes.BOOLEAN, defaultValue: false, field: "badge_earned" },
  },
  {
    tableName: "checkpoint_attempts",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["user_hunt_id", "checkpoint_id"] },
      { fields: ["checkpoint_id"] },
      { fields: ["user_hunt_id"] },
    ],
  }
);

module.exports = CheckpointAttempt;
