const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Hunt = sequelize.define(
  "Hunt",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    creator_id: {
      type: DataTypes.INTEGER,
      references: {
        model: "users",
        key: "id",
      },
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: DataTypes.TEXT,
    is_published: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    access_code: {
      type: DataTypes.STRING,
      unique: true,
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
    original_hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "hunts",
        key: "id",
      },
    },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    tableName: "hunts",
    timestamps: false,
  }
);

module.exports = Hunt;
