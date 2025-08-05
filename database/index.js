const sequelize = require("./db");

const User = require("./user");
const Hunt = require("./hunt");

// Associations for User and Hunt models
User.hasMany(Hunt, { foreignKey: "creator_id" });
Hunt.belongsTo(User, { foreignKey: "creator_id" });

// many users can participate in many hunts - joint table
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

/*

  const sequelize = require("./db");

// Models
const User = require("./user");
const Hunt = require("./hunt");
const UserHunt = require("./userHunt");
const CheckpointAttempt = require("./checkpointAttempt");
const HuntInvite = require("./huntInvite");
const Friend = require("./friend");
const UserBadge = require("./userBadge");
const LeaderboardEntry = require("./leaderboardEntry");
const HuntFeedback = require("./huntFeedback");
const Notification = require("./notification");
const Media = require("./media");
const KioskSession = require("./kioskSession");
const HuntAdmin = require("./huntAdmin");
const AuditLog = require("./auditLog");

const Checkpoint = require("./checkpoint");
const Badge = require("./badge");

// Associations
User.hasMany(Hunt, { foreignKey: "creator_id" });
Hunt.belongsTo(User, { foreignKey: "creator_id" });

User.belongsToMany(Hunt, {
  through: UserHunt,
  foreignKey: "user_id",
  otherKey: "hunt_id",
});
Hunt.belongsToMany(User, {
  through: UserHunt,
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

User.hasMany(Friend, { foreignKey: "requester_id", as: "RequestedFriends" });
User.hasMany(Friend, { foreignKey: "reciever_id", as: "ReceivedFriends" });

User.hasMany(UserBadge, { foreignKey: "user_id" });
UserBadge.belongsTo(User, { foreignKey: "user_id" });

Hunt.hasMany(LeaderboardEntry, { foreignKey: "hunt_id" });
User.hasMany(LeaderboardEntry, { foreignKey: "user_id" });

Hunt.hasMany(HuntFeedback, { foreignKey: "hunt_id" });
User.hasMany(HuntFeedback, { foreignKey: "user_id" });

User.hasMany(Notification, { foreignKey: "user_id" });

User.hasMany(Media, { foreignKey: "uploaded_by" });

Hunt.hasMany(HuntAdmin, { foreignKey: "hunt_id" });
User.hasMany(HuntAdmin, { foreignKey: "user_id" });
User.hasMany(HuntAdmin, { foreignKey: "assigned_by", as: "AssignedAdmins" });

sequelize
  .sync({ alter: true }) // Use force: true only during dev seeding
  .then(() => {
    console.log("✅ Tables synced");
    process.exit();
  })
  .catch((err) => {
    console.error("❌ Sync error:", err);
    process.exit(1);
  });

module.exports = {
  sequelize,
  User,
  Hunt,
  UserHunt,
  CheckpointAttempt,
  HuntInvite,
  Friend,
  UserBadge,
  LeaderboardEntry,
  HuntFeedback,
  Notification,
  Media,
  KioskSession,
  HuntAdmin,
  AuditLog,
  Checkpoint,
  Badge,
};
*/
