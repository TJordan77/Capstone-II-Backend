const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntAdmin = sequelize.define(
  "HuntAdmin",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    role: { type: DataTypes.STRING }, // 'creator' | 'editor' | 'mod'
    assignedBy: { type: DataTypes.INTEGER, allowNull: false, field: "assigned_by" },
    assignedAt: { type: DataTypes.DATE, field: "assigned_at" },
  },
  {
    tableName: "hunt_admins",
    timestamps: false,
    indexes: [
      { unique: true, fields: ["user_id", "hunt_id"] },
      { fields: ["hunt_id"] },
      { fields: ["user_id"] },
    ],
  }
);

module.exports = HuntAdmin;
