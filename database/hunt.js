const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Hunt = sequelize.define(
  "Hunt",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    creatorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "creator_id",
      references: { model: "users", key: "id" },
    },

    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },

    isPublished: { type: DataTypes.BOOLEAN, defaultValue: false, field: "is_published" },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: "is_active" },

    accessCode: { type: DataTypes.STRING, unique: true, field: "access_code" },

    version: { type: DataTypes.INTEGER, defaultValue: 1 },

    originalHuntId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "original_hunt_id",
      references: { model: "hunts", key: "id" },
    },
  },
  {
    tableName: "hunts",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["access_code"] },
      { fields: ["creator_id"] },
      { fields: ["original_hunt_id"] },
    ],
  }
);

module.exports = Hunt;
