const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UserBadge = sequelize.define(
  "UserBadge",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    badgeId: { type: DataTypes.INTEGER, allowNull: false, field: "badge_id" },
    earnedAt: { type: DataTypes.DATE, field: "earned_at", defaultValue: DataTypes.NOW },
  },
  {
    tableName: "user_badges",
    timestamps: false,
    indexes: [{ unique: true, fields: ["user_id", "badge_id"] }],
  }
);

module.exports = UserBadge;
