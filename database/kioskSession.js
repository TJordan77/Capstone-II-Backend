const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const KioskSession = sequelize.define(
  "KioskSession",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    location_name: DataTypes.STRING,
    kiosk_code: {
      type: DataTypes.STRING,
      unique: true,
    },
    hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    started_at: DataTypes.DATE,
    ended_at: DataTypes.DATE,
  },
  {
    tableName: "kiosk_sessions",
    timestamps: false,
  }
);

module.exports = KioskSession;
