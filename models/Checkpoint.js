const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Hunt = require('./Hunt');

const Checkpoint = sequelize.define('Checkpoint', {
  riddle: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  hint: {
    type: DataTypes.TEXT,
  },
  latitude: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  longitude: {
    type: DataTypes.FLOAT,
    allowNull: false,
  },
  order: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  badgeImage: {
    type: DataTypes.STRING,
  },
  badgeTitle: {
    type: DataTypes.STRING,
  },
});

Hunt.hasMany(Checkpoint, { foreignKey: 'huntId', onDelete: 'CASCADE' });
Checkpoint.belongsTo(Hunt, { foreignKey: 'huntId' });

module.exports = Checkpoint;