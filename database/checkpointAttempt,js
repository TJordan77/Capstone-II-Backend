const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const CheckpointAttempt = sequelize.define("CheckpointAttempt", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_hunt_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  checkpoint_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reached_at: DataTypes.DATE,
  riddle_answer: DataTypes.TEXT,
  was_correct: DataTypes.BOOLEAN,
  badge_earned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: "checkpoint_attempts",
  timestamps: false,
});

module.exports = CheckpointAttempt;
