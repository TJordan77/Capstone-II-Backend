const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Checkpoint = sequelize.define(
  "Checkpoint",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    orderIndex: { type: DataTypes.INTEGER, allowNull: false, field: "order_index" },
    title: { type: DataTypes.STRING, allowNull: false },
    riddle: { type: DataTypes.TEXT, allowNull: false },
    answer: { type: DataTypes.STRING, allowNull: false },     // hash later
    maxAttempts: { type: DataTypes.INTEGER, allowNull: true, field: "max_attempts", validate: { min: 1 } },
    tolerance: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 25 }, // meters
    hint: { type: DataTypes.STRING, allowNull: true },
    lat: { type: DataTypes.FLOAT, allowNull: false },
    lng: { type: DataTypes.FLOAT, allowNull: false },
  },
  {
    tableName: "checkpoints",
    timestamps: true,
    indexes: [
      { fields: ["hunt_id"] },
      { unique: true, fields: ["hunt_id", "orderIndex"] },
    ],
  }
);

module.exports = Checkpoint;
