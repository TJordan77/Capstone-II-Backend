const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Friend = sequelize.define(
  "Friend",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requesterId: { type: DataTypes.INTEGER, allowNull: false, field: "requester_id" },
    receiverId: { type: DataTypes.INTEGER, allowNull: false, field: "receiver_id" }, // fixed typo
    status: { type: DataTypes.STRING }, // 'pending','accepted','blocked'
  },
  {
    tableName: "friends",
    timestamps: true, // created_at/updated_at
    indexes: [{ unique: true, fields: ["requester_id", "receiver_id"] }],
  }
);

module.exports = Friend;
