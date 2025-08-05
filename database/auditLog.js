const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    actor_type: DataTypes.STRING, // 'user', 'admin'
    actor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    action: DataTypes.STRING,
    target_table: DataTypes.STRING,
    target_id: DataTypes.INTEGER,
    timestamp: DataTypes.DATE,
  },
  {
    tableName: "audit_logs",
    timestamps: false,
  }
);

module.exports = AuditLog;
