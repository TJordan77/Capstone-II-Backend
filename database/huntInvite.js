const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const HuntInvite = sequelize.define(
  "HuntInvite",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    huntId: { type: DataTypes.INTEGER, allowNull: false, field: "hunt_id" },
    userId: { type: DataTypes.INTEGER, allowNull: true, field: "user_id" },
    email: { type: DataTypes.STRING, allowNull: true, validate: { isEmail: true } },
    status: { type: DataTypes.STRING }, // 'pending' | 'accepted' | 'declined' | 'expired'
    sentAt: { type: DataTypes.DATE, field: "sent_at" },
    respondedAt: { type: DataTypes.DATE, field: "responded_at" },
  },
  {
    tableName: "hunt_invites",
    timestamps: false,
    indexes: [
      { fields: ["hunt_id"] },
      { fields: ["user_id"] },
      { fields: ["email"] },
      // Optional business rules:
      // { unique: true, fields: ["hunt_id", "email"] },
      // { unique: true, fields: ["hunt_id", "user_id"] },
    ],
  }
);

module.exports = HuntInvite;
