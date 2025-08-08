const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Hunt = sequelize.define('Hunt', {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  isPublished: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  slug: {
    type: DataTypes.STRING,
    unique: true,
  },
  creatorId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

module.exports = Hunt;