const sequelize = require("./db");

// Models
const User = require("./user");
const Hunt = require("./hunt");
const UserHunt = require("./userHunt");
const Checkpoint = require("./checkpoint");
const Badge = require("./badge");
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

Hunt.hasMany(Checkpoint, { foreignKey: "huntId" });
Checkpoint.belongsTo(Hunt, { foreignKey: "huntId" });

Checkpoint.belongsTo(Hunt, { foreignKey: "hunt_id" });
Badge.belongsTo(Checkpoint, { foreignKey: "checkpoint_id" });

Checkpoint.hasOne(Badge, { foreignKey: "checkpointId" });
Badge.belongsTo(Checkpoint, { foreignKey: "checkpointId" });

// Sync only when running directly (optional)
// sequelize.sync({ alter: true })
//   .then(() => console.log("✅ Tables synced"))
//   .catch((err) => console.error("❌ Sync error:", err));

// Export for use in seed.js and elsewhere
module.exports = {
  sequelize,
  db: sequelize,
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
