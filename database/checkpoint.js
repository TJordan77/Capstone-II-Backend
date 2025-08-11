const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Checkpoint = sequelize.define(
  "Checkpoint",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    order: { type: DataTypes.INTEGER, allowNull: false },
    riddle: { type: DataTypes.TEXT, allowNull: false },
    hint: { type: DataTypes.STRING, allowNull: true },
    lat: { type: DataTypes.FLOAT, allowNull: false },
    lng: { type: DataTypes.FLOAT, allowNull: false },
  },
  {
    tableName: "checkpoints",
    timestamps: true,
    indexes: [
      { fields: ["hunt_id"] },
      { unique: true, fields: ["hunt_id", "order"] },
    ],
  }
);

module.exports = Checkpoint;
