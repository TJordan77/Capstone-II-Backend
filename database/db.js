require("dotenv").config();
const { Sequelize } = require("sequelize");
const pg = require("pg");

// Feel free to rename the database to whatever you want!
// const dbName = "capstone-2";

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL not set");
}

const db = new Sequelize(process.env.DATABASE_URL, {
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false, // ok for Neon/Vercel
    },
  },
});

module.exports = db;
