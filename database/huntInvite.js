const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntInvite = sequelize.define(
  "HuntInvite",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    email: DataTypes.STRING,
    status: DataTypes.STRING,
    sent_at: DataTypes.DATE,
    responded_at: DataTypes.DATE,
  },
  {
    tableName: "hunt_invites",
    timestamps: false,
  }
);

module.exports = HuntInvite;
