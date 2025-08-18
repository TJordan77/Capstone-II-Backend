const { DataTypes } = require("sequelize");
const sequelize = require("./db");

const Hunt = sequelize.define(
  "Hunt",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    creatorId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "creator_id",
      references: { model: "users", key: "id" },
    },

    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },

    // New fields added to match the UI
    endsAt: { type: DataTypes.DATE, allowNull: true, field: "ends_at" },
    maxPlayers: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "max_players",
      validate: { min: 1 },
    },
    visibility: {
      type: DataTypes.ENUM("public", "private", "unlisted"),
      allowNull: false,
      defaultValue: "public",
      field: "visibility",
    },
    coverUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "cover_url",
      validate: { len: [0, 1024] },
    },

    isPublished: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: "is_published",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: "is_active",
    },

    accessCode: { type: DataTypes.STRING, unique: true, field: "access_code" },

    version: { type: DataTypes.INTEGER, defaultValue: 1 },

    // Slug for pretty URLs and QR codes
    slug: { type: DataTypes.STRING, allowNull: true, unique: true },

    originalHuntId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "original_hunt_id",
      references: { model: "hunts", key: "id" },
    },
  },
  {
    tableName: "hunts",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["access_code"] },
      { fields: ["creator_id"] },
      { fields: ["original_hunt_id"] },
      { fields: ["visibility"] },
      { fields: ["is_active", "is_published"] }, // optional compound filter index
    ],
  }
);

// Auto-generate slug from title if not provided
Hunt.beforeValidate((h) => {
  if (!h.slug && h.title) {
    h.slug = h.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  }
});

module.exports = Hunt;
