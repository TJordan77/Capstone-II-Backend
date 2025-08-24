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
const UserCheckpointProgress = require("./userCheckpointProgress");

// Hunt.creator -> User
Hunt.belongsTo(User, {
  as: "creator",
  foreignKey: { name: "creatorId", field: "creator_id" },
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
User.hasMany(Hunt, {
  as: "createdHunts",
  foreignKey: { name: "creatorId", field: "creator_id" },
});

// Hunt versions (self-ref)
Hunt.belongsTo(Hunt, {
  as: "originalHunt",
  foreignKey: { name: "originalHuntId", field: "original_hunt_id" },
  onDelete: "SET NULL",
});
Hunt.hasMany(Hunt, {
  as: "forks",
  foreignKey: { name: "originalHuntId", field: "original_hunt_id" },
});

// User <-> Hunt via UserHunt
User.belongsToMany(Hunt, {
  through: UserHunt,
  foreignKey: { name: "userId", field: "user_id" },
  otherKey: { name: "huntId", field: "hunt_id" },
  as: "joinedHunts",
});
Hunt.belongsToMany(User, {
  through: UserHunt,
  foreignKey: { name: "huntId", field: "hunt_id" },
  otherKey: { name: "userId", field: "user_id" },
  as: "players",
});

/* Bridge associations so includes like { as: "hunt" } and { as: "user" } work */
UserHunt.belongsTo(User, {
  as: "user",
  foreignKey: { name: "userId", field: "user_id" },
});
User.hasMany(UserHunt, {
  as: "userHunts",
  foreignKey: { name: "userId", field: "user_id" },
});
UserHunt.belongsTo(Hunt, {
  as: "hunt",
  foreignKey: { name: "huntId", field: "hunt_id" },
});
Hunt.hasMany(UserHunt, {
  as: "userHunts",
  foreignKey: { name: "huntId", field: "hunt_id" },
});

// Checkpoints belong to Hunts
Checkpoint.belongsTo(Hunt, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Hunt.hasMany(Checkpoint, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  as: "checkpoints",
});

// Badges belong to Checkpoints
Badge.belongsTo(Checkpoint, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});
Checkpoint.hasOne(Badge, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  as: "badge",
});

// User <-> Badge via UserBadge
User.belongsToMany(Badge, {
  through: UserBadge,
  foreignKey: { name: "userId", field: "user_id" },
  otherKey: { name: "badgeId", field: "badge_id" },
  as: "badges",
});
Badge.belongsToMany(User, {
  through: UserBadge,
  foreignKey: { name: "badgeId", field: "badge_id" },
  otherKey: { name: "userId", field: "user_id" },
  as: "owners",
});

// Direct refs from the join table (needed for includes using `as: "badge"`)
/* 🔧 SMALL EDIT: add `as: "user"` so includes can use that alias */
UserBadge.belongsTo(User, {
  as: "user",
  foreignKey: { name: "userId", field: "user_id" },
});
UserBadge.belongsTo(Badge, {
  as: "badge",
  foreignKey: { name: "badgeId", field: "badge_id" },
});

/* optional but handy reverse hasManys for joins */
User.hasMany(UserBadge, {
  as: "userBadges",
  foreignKey: { name: "userId", field: "user_id" },
});
Badge.hasMany(UserBadge, {
  as: "userBadges",
  foreignKey: { name: "badgeId", field: "badge_id" },
});

// Attempts belong to UserHunt & Checkpoint
CheckpointAttempt.belongsTo(UserHunt, {
  foreignKey: { name: "userHuntId", field: "user_hunt_id" },
  onDelete: "CASCADE",
});
UserHunt.hasMany(CheckpointAttempt, {
  foreignKey: { name: "userHuntId", field: "user_hunt_id" },
  as: "attempts",
});

CheckpointAttempt.belongsTo(Checkpoint, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  onDelete: "CASCADE",
});
Checkpoint.hasMany(CheckpointAttempt, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  as: "attempts",
});

// Attempt limits / Counters
// one row per (userHunt, checkpoint) with attemptsCount & solvedAt
UserCheckpointProgress.belongsTo(UserHunt, {
  foreignKey: { name: "userHuntId", field: "user_hunt_id" },
  onDelete: "CASCADE",
});
UserHunt.hasMany(UserCheckpointProgress, {
  foreignKey: { name: "userHuntId", field: "user_hunt_id" },
  as: "checkpointProgress",
});

UserCheckpointProgress.belongsTo(Checkpoint, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  onDelete: "CASCADE",
});
Checkpoint.hasMany(UserCheckpointProgress, {
  foreignKey: { name: "checkpointId", field: "checkpoint_id" },
  as: "progress",
});

// Leaderboard entries (per hunt/user)
LeaderboardEntry.belongsTo(Hunt, {
  foreignKey: { name: "huntId", field: "hunt_id" },
});
LeaderboardEntry.belongsTo(User, {
  foreignKey: { name: "userId", field: "user_id" },
});
Hunt.hasMany(LeaderboardEntry, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  as: "leaderboard",
});
User.hasMany(LeaderboardEntry, {
  foreignKey: { name: "userId", field: "user_id" },
  as: "leaderboardEntries",
});

// Feedback
HuntFeedback.belongsTo(Hunt, {
  foreignKey: { name: "huntId", field: "hunt_id" },
});
HuntFeedback.belongsTo(User, {
  foreignKey: { name: "userId", field: "user_id" },
});
Hunt.hasMany(HuntFeedback, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  as: "feedback",
});
User.hasMany(HuntFeedback, {
  foreignKey: { name: "userId", field: "user_id" },
  as: "feedbackGiven",
});

// Notifications
Notification.belongsTo(User, {
  foreignKey: { name: "userId", field: "user_id" },
});
User.hasMany(Notification, {
  foreignKey: { name: "userId", field: "user_id" },
  as: "notifications",
});

// Media
Media.belongsTo(User, {
  foreignKey: { name: "uploadedBy", field: "uploaded_by" },
});
User.hasMany(Media, {
  foreignKey: { name: "uploadedBy", field: "uploaded_by" },
  as: "uploads",
});

// Kiosk sessions
KioskSession.belongsTo(Hunt, {
  foreignKey: { name: "huntId", field: "hunt_id" },
});
Hunt.hasMany(KioskSession, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  as: "kioskSessions",
});

// Hunt admins
HuntAdmin.belongsTo(Hunt, {
  foreignKey: { name: "huntId", field: "hunt_id" },
});
Hunt.hasMany(HuntAdmin, {
  foreignKey: { name: "huntId", field: "hunt_id" },
  as: "admins",
});

HuntAdmin.belongsTo(User, {
  foreignKey: { name: "userId", field: "user_id" },
});
User.hasMany(HuntAdmin, {
  foreignKey: { name: "userId", field: "user_id" },
  as: "huntAdminOf",
});

HuntAdmin.belongsTo(User, {
  as: "assigner",
  foreignKey: { name: "assignedBy", field: "assigned_by" },
});
User.hasMany(HuntAdmin, {
  as: "assignedAdmins",
  foreignKey: { name: "assignedBy", field: "assigned_by" },
});

// Friends
Friend.belongsTo(User, {
  as: "requester",
  foreignKey: { name: "requesterId", field: "requester_id" },
});
Friend.belongsTo(User, {
  as: "receiver",
  foreignKey: { name: "receiverId", field: "receiver_id" },
});
User.hasMany(Friend, {
  as: "requestedFriends",
  foreignKey: { name: "requesterId", field: "requester_id" },
});
User.hasMany(Friend, {
  as: "receivedFriends",
  foreignKey: { name: "receiverId", field: "receiver_id" },
});

module.exports = {
  sequelize,
  db: sequelize,
  User,
  Hunt,
  UserHunt,
  Checkpoint,
  Badge,
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
  UserCheckpointProgress,
};
