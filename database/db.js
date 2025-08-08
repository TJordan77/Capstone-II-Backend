require("dotenv").config();
const { Sequelize } = require("sequelize");
const pg = require("pg");

// Feel free to rename the database to whatever you want!
// const dbName = "capstone-2";

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL not set in .env file");
}

const db = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
});

module.exports = db;
