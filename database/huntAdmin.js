const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntAdmin = sequelize.define(
  "HuntAdmin",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    role: DataTypes.STRING, // 'creator', 'editor', 'mods'
    assigned_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    assigned_at: DataTypes.DATE,
  },
  {
    tableName: "hunt_admins",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["user_id", "hunt_id"],
      },
    ],
  }
);

module.exports = HuntAdmin;
