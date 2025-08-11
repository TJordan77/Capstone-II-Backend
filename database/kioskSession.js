const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const KioskSession = sequelize.define(
  "KioskSession",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    locationName: { type: DataTypes.STRING, field: "location_name" },
    kioskCode: { type: DataTypes.STRING, unique: true, field: "kiosk_code" },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    startedAt: { type: DataTypes.DATE, field: "started_at" },
    endedAt: { type: DataTypes.DATE, field: "ended_at" },
  },
  {
    tableName: "kiosk_sessions",
    timestamps: false,
    indexes: [{ fields: ["hunt_id"] }, { unique: true, fields: ["kiosk_code"] }],
  }
);

module.exports = KioskSession;
