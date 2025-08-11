const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Notification = sequelize.define(
  "Notification",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: "user_id" },
    type: { type: DataTypes.STRING },        // 'email', 'sms'
    template: { type: DataTypes.STRING },    // 'hunt_start', 'you_are_next', ...
    deliveryStatus: { type: DataTypes.STRING, field: "delivery_status" }, // 'queued','sent','failed'
    scheduledFor: { type: DataTypes.DATE, field: "scheduled_for" },
    sentAt: { type: DataTypes.DATE, field: "sent_at" },
    errorMessage: { type: DataTypes.TEXT, field: "error_message" },
  },
  {
    tableName: "notifications",
    timestamps: false,
    indexes: [{ fields: ["user_id"] }, { fields: ["delivery_status"] }],
  }
);

module.exports = Notification;
