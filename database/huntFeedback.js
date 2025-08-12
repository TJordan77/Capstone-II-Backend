const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntFeedback = sequelize.define(
  "HuntFeedback",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
    comment: { type: DataTypes.TEXT },
    submittedAt: { type: DataTypes.DATE, field: "submitted_at" },
  },
  {
    tableName: "hunt_feedback",
    timestamps: false,
    indexes: [{ fields: ["hunt_id"] }, { fields: ["user_id"] }],
  }
);

module.exports = HuntFeedback;
