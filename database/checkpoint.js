const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Checkpoint = sequelize.define(
  "Checkpoint",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    order: { type: DataTypes.INTEGER, allowNull: false, field: "order" },
    title: { type: DataTypes.STRING, allowNull: false, validate: { len: [1, 200] } },
    riddle: { type: DataTypes.TEXT, allowNull: false, validate: { len: [1, 5000] } },
    answer: { type: DataTypes.STRING, allowNull: false },
    tolerance: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 25, validate: { min: 0.1 } },
    hint: { type: DataTypes.STRING, allowNull: true },
    lat: { type: DataTypes.FLOAT, allowNull: false, validate: { min: -90, max: 90 } },
    lng: { type: DataTypes.FLOAT, allowNull: false, validate: { min: -180, max: 180 } },
  },
  {
    tableName: "checkpoints",
    timestamps: true,
    indexes: [
      { fields: ["hunt_id"] },
      { unique: true, fields: ["hunt_id", "order"] }, // enforce unique checkpoint order
    ],
  }
);

module.exports = Checkpoint;
