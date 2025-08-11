const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Media = sequelize.define(
  "Media",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.STRING }, // 'image', 'audio', 'video'
    url: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    uploadedBy: { type: DataTypes.INTEGER, allowNull: false, field: "uploaded_by" },
    uploadedAt: { type: DataTypes.DATE, field: "uploaded_at" },
  },
  {
    tableName: "media",
    timestamps: false,
    indexes: [{ fields: ["uploaded_by"] }],
  }
);

module.exports = Media;
