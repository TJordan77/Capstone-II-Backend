require("pg");
require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectOptions: {
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false
  },
  pool: {
    max: 5,       // keeping it small for serverless
    min: 0,
    idle: 10000,  // close idle quickly
    acquire: 30000
  },
  define: { underscored: true },
  logging: false
});

module.exports = sequelize;