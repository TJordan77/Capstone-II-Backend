const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Notification = sequelize.define(
  "Notification",
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
    type: DataTypes.STRING, // 'email', 'sms'
    template: DataTypes.STRING, // 'hunt_start', 'you_are_next', etc.
    delivery_status: DataTypes.STRING, // 'queued', 'sent', 'failed'
    scheduled_for: DataTypes.DATE,
    sent_at: DataTypes.DATE,
    error_message: DataTypes.TEXT,
  },
  {
    tableName: "notifications",
    timestamps: false,
  }
);

module.exports = Notification;
