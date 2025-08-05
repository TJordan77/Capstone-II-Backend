const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntFeedback = sequelize.define(
  "HuntFeedback",
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
    rating: {
      type: DataTypes.INTEGER,
      validate: {
        min: 1,
        max: 5,
      },
    },
    comment: DataTypes.TEXT,
    submitted_at: DataTypes.DATE,
  },
  {
    tableName: "hunt_feedback",
    timestamps: false,
  }
);

module.exports = HuntFeedback;
