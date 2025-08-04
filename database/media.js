const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Media = sequelize.define(
  "Media",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    type: DataTypes.STRING, // 'image', 'audio', 'video'
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: DataTypes.TEXT,
    uploaded_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    uploaded_at: DataTypes.DATE,
  },
  {
    tableName: "media",
    timestamps: false,
  }
);

module.exports = Media;
