const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Badge = sequelize.define(
  "Badge",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    checkpointId: { type: DataTypes.INTEGER, allowNull: false, field: "checkpoint_id" },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING, allowNull: true },
  },
  {
    tableName: "badges",
    timestamps: true,
    indexes: [{ fields: ["checkpoint_id"] }],
  }
);

module.exports = Badge;
