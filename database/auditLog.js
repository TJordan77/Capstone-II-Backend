const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    actorType: { type: DataTypes.STRING, field: "actor_type" }, // 'user', 'admin'
    actorId: { type: DataTypes.INTEGER, allowNull: false, field: "actor_id" },
    action: { type: DataTypes.STRING },
    targetTable: { type: DataTypes.STRING, field: "target_table" },
    targetId: { type: DataTypes.INTEGER, field: "target_id" },
    timestamp: { type: DataTypes.DATE },
  },
  {
    tableName: "audit_logs",
    timestamps: false,
    indexes: [{ fields: ["actor_id"] }, { fields: ["target_table", "target_id"] }],
  }
);

module.exports = AuditLog;
