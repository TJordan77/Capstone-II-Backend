const { DataTypes } = require("sequelize");
const sequelize = require("./db");
const bcrypt = require("bcrypt");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: { len: [3, 20] },
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: { isEmail: true },
    },
    auth0Id: { type: DataTypes.STRING, allowNull: true, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: true },
    // optional profile fields used by your UI
    role: { type: DataTypes.STRING, allowNull: true },
    profilePicture: { type: DataTypes.STRING, allowNull: true },
    badgeCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
  },
  {
    tableName: "users",
    timestamps: true,
    indexes: [{ fields: ["username"] }, { fields: ["email"] }],
  }
);

User.prototype.checkPassword = function (password) {
  if (!this.passwordHash) return false;
  return bcrypt.compareSync(password, this.passwordHash);
};

User.hashPassword = function (password) {
  return bcrypt.hashSync(password, 10);
};

module.exports = User;
