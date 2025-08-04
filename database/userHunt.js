const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const UserHunt = sequelize.define(
  "UserHunt",
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
    hunt_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    started_at: DataTypes.DATE,
    completed_at: DataTypes.DATE,
    status: DataTypes.STRING, // 'active', 'completed', 'abandoned'
    total_badges: DataTypes.INTEGER,
    total_time_seconds: DataTypes.INTEGER,
  },
  {
    tableName: "user_hunts",
    timestamps: false,
    indexes: [
      {
        fields: ["user_id", "hunt_id"],
      },
    ],
  }
);

module.exports = UserHunt;
