const sequelize = require("./db");

const User = require("./user");
const Hunt = require("./hunt");

// Associations for User and Hunt models
User.hasMany(Hunt, { foreignKey: "creator_id" });
Hunt.belongsTo(User, { foreignKey: "creator_id" });

// many users can participate in many hunts
User.belongsToMany(Hunt, {
  through: "UserHunts",
  foreignKey: "user_id",
  otherKey: "hunt_id",
});

Hunt.belongsToMany(User, {
  through: "UserHunts",
  foreignKey: "hunt_id",
  otherKey: "user_id",
});

Hunt.belongsTo(Hunt, {
  as: "OriginalHunt",
  foreignKey: "original_hunt_id",
});

Hunt.hasMany(Hunt, {
  as: "Versions",
  foreignKey: "original_hunt_id",
});

sequelize
  .sync({ alter: true })
  .then(() => {
    console.log("✅ Tables synced");
    process.exit();
  })
  .catch((err) => {
    console.error("❌ Sync error:", err);
    process.exit(1);
  });
