require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  dialectOptions: {
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  },
  define: {
    underscored: true, // created_at/updated_at + default fk snake_case
  },
  logging: false, // quiet logs
});

module.exports = sequelize;
