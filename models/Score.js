const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');
const Hunt = require('./Hunt');

const Score = sequelize.define('Score', {
  completionTime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Time in seconds to complete the hunt',
  },
  completionDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
});

Score.belongsTo(User, { foreignKey: 'userId', onDelete: 'CASCADE' });
Score.belongsTo(Hunt, { foreignKey: 'huntId', onDelete: 'CASCADE' });

module.exports = Score;