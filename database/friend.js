const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Friend = sequelize.define(
  "Friend",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    requester_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reciever_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: DataTypes.STRING,
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    tableName: "friends",
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ["requester_id", "reciever_id"],
      },
    ],
  }
);

module.exports = Friend;
