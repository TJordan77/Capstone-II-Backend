const {
  sequelize,
  User,
  Hunt,
  Checkpoint,
  Badge,
  UserHunt,
  CheckpointAttempt,
  HuntInvite,
  Friend,
  Notification,
  HuntFeedback,
  HuntAdmin,
  LeaderboardEntry,
  UserBadge,
} = require("./index");

const { Op } = require("sequelize"); // used once for IN query (safe to keep)

// === helpers ===
function generateAccessCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes O/0/1/I
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

// Convert meter offsets to lat/lng deltas near a latitude
function offsetMeters(lat, lng, dxMeters, dyMeters) {
  // dy = north/south (lat), dx = east/west (lng)
  const metersPerDegLat = 111_111; // approx
  const metersPerDegLng = 111_111 * Math.cos((lat * Math.PI) / 180);
  const dLat = dyMeters / metersPerDegLat;
  const dLng = dxMeters / metersPerDegLng;
  return { lat: lat + dLat, lng: lng + dLng };
}

async function seed() {
  try {
    await sequelize.sync({ force: true });
    console.log("🌱 Database synced");

    // --- Users ---
    const admin = await User.create({
      firstName: "Alice",
      lastName: "Admin",
      username: "admin1",
      email: "admin@example.com",
      passwordHash: User.hashPassword("admin123"),
      role: "admin",
      profilePicture: "",
      badgeCount: 0,
    });

    const creator = await User.create({
      firstName: "Charlie",
      lastName: "Creator",
      username: "creator1",
      email: "creator@example.com",
      passwordHash: User.hashPassword("creator123"),
      role: "creator",
      profilePicture: "",
      badgeCount: 0,
    });

    const player = await User.create({
      firstName: "Penny",
      lastName: "Player",
      username: "player1",
      email: "player@example.com",
      passwordHash: User.hashPassword("player123"),
      role: "player",
      profilePicture: "",
      badgeCount: 0,
    });

    const player2 = await User.create({
      firstName: "Sam",
      lastName: "Strider",
      username: "player2",
      email: "player2@example.com",
      passwordHash: User.hashPassword("player2"),
      role: "player",
      profilePicture: "",
      badgeCount: 0,
    });

    const player3 = await User.create({
      firstName: "Maya",
      lastName: "Mapper",
      username: "player3",
      email: "player3@example.com",
      passwordHash: User.hashPassword("player3"),
      role: "player",
      profilePicture: "",
      badgeCount: 0,
    });

    // --- Tutorial Hunt (CP1 at provided user location) ---
    const baseLat =
      process.env.START_LAT != null ? Number(process.env.START_LAT) : 40.7128;
    const baseLng =
      process.env.START_LNG != null ? Number(process.env.START_LNG) : -74.0060;

    if (
      Number.isNaN(baseLat) ||
      Number.isNaN(baseLng) ||
      Math.abs(baseLat) > 90 ||
      Math.abs(baseLng) > 180
    ) {
      throw new Error("Invalid START_LAT/START_LNG values provided.");
    }

    const cp1LL = { lat: baseLat, lng: baseLng };              // start point (user location)
    const cp2LL = offsetMeters(baseLat, baseLng, 150, 120);     // ~190m NE
    const cp3LL = offsetMeters(baseLat, baseLng, -220, 240);    // ~330m NW

    const tutorialHunt = await Hunt.create({
      title: "SideQuest Tutorial",
      description:
        "A short, guided hunt to test GPS, riddles, and progression. Start where you are, then head to two nearby spots.",
      creatorId: creator.id,
      isActive: true,
      isPublished: true,
      version: 1,
      // new hunt fields (ensure your model & migration include these)
      endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000), // +3 days
      maxPlayers: 500,
      visibility: "public",
      coverUrl:
        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1600&q=80&auto=format&fit=crop",
      accessCode: generateAccessCode(),
    });

    const tut1 = await Checkpoint.create({
      huntId: tutorialHunt.id,
      order: 1,
      title: "Ready, Set, Start!",
      riddle: "You’re already here. Type **ready** to begin your SideQuest.",
      answer: "ready",
      hint: "Just type the word.",
      lat: cp1LL.lat,
      lng: cp1LL.lng,
      tolerance: 35,
    });
    const tut2 = await Checkpoint.create({
      huntId: tutorialHunt.id,
      order: 2,
      title: "The Green Spot",
      riddle:
        "Seek a patch of green where footsteps pause. What am I? (hint: a small public space)",
      answer: "park",
      hint: "Benches and trees.",
      lat: cp2LL.lat,
      lng: cp2LL.lng,
      tolerance: 35,
    });
    const tut3 = await Checkpoint.create({
      huntId: tutorialHunt.id,
      order: 3,
      title: "Final Marker",
      riddle: "Water dances and coins may glimmer. Name this feature to finish.",
      answer: "fountain",
      hint: "Splash!",
      lat: cp3LL.lat,
      lng: cp3LL.lng,
      tolerance: 35,
    });

    // === BADGES for the tutorial checkpoints (uses your Badge model fields) ===
    await Badge.bulkCreate([
      { checkpointId: tut1.id, title: "Trailhead",  description: "Started your first SideQuest.", image: "/badges/trailhead.png" },
      { checkpointId: tut2.id, title: "Pathfinder", description: "You found the green spot.",     image: "/badges/pathfinder.png" },
      { checkpointId: tut3.id, title: "Finisher",   description: "You completed the tutorial!",   image: "/badges/finisher.png" },
    ]);

    // --- Second public hunt (fixed coords) ---
    const cityHunt = await Hunt.create({
      title: "City Secrets",
      description: "Find clues across downtown.",
      creatorId: creator.id,
      isActive: true,
      isPublished: true,
      version: 1,
      visibility: "public",
      endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      maxPlayers: 100,
      coverUrl: "https://picsum.photos/seed/sidequest-city/1200/600",
      accessCode: generateAccessCode(),
    });

    const cs1 = await Checkpoint.create({
      huntId: cityHunt.id, order: 1,
      title: "Grand Clock", riddle: "I count the hours.", answer: "clock",
      lat: baseLat + 0.0001, lng: baseLng - 0.0002, tolerance: 30, hint: "Look up",
    });
    const cs2 = await Checkpoint.create({
      huntId: cityHunt.id, order: 2,
      title: "Red Doors", riddle: "A quiet place of worship.", answer: "church",
      lat: baseLat + 0.0004, lng: baseLng - 0.0008, tolerance: 30,
    });
    const cs3 = await Checkpoint.create({
      huntId: cityHunt.id, order: 3,
      title: "Market Lane", riddle: "Vendors gather here.", answer: "market",
      lat: baseLat + 0.0007, lng: baseLng - 0.0001, tolerance: 30,
    });

    // === BADGES for the City Secrets checkpoints ===
    await Badge.bulkCreate([
      { checkpointId: cs1.id, title: "Timekeeper", description: "Found the clock.",  image: "/badges/clock.png" },
      { checkpointId: cs2.id, title: "Sanctuary",  description: "Found the church.", image: "/badges/church.png" },
      { checkpointId: cs3.id, title: "Merchant",   description: "Found the market.", image: "/badges/market.png" },
    ]);

    // --- Private hunt (invite-only) ---
    const privateHunt = await Hunt.create({
      title: "VIP Backstage",
      description: "Invite-only hunt.",
      creatorId: admin.id,
      isActive: true,
      isPublished: false,
      version: 1,
      visibility: "private",
      coverUrl: "https://picsum.photos/seed/backstage/1200/600",
      accessCode: "PRIVATE7",
    });

    await Checkpoint.bulkCreate([
      { huntId: privateHunt.id, order: 1, title: "Stage Door", riddle: "Knock thrice.",  answer: "knock", lat: baseLat - 0.0002, lng: baseLng + 0.0003, tolerance: 25 },
      { huntId: privateHunt.id, order: 2, title: "Green Room", riddle: "Color of calm.", answer: "green", lat: baseLat - 0.0003, lng: baseLng + 0.0005, tolerance: 25 },
    ]);

    if (typeof HuntInvite !== "undefined" && HuntInvite?.create) {
      await HuntInvite.create({ huntId: privateHunt.id, code: "PRIVATE7" });
    }

    // --- UserHunt (drives leaderboard fallback) ---
    const uh1 = await UserHunt.create({
      userId: player.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),   // 1h ago
      completedAt: new Date(Date.now() - 30 * 60 * 1000), // 30m ago
      status: "completed",
      totalTimeSeconds: 30 * 60,
      totalBadges: 3,
    });

    const uh2 = await UserHunt.create({
      userId: player2.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 90 * 60 * 1000),
      completedAt: new Date(Date.now() - 40 * 60 * 1000),
      status: "completed",
      totalTimeSeconds: 50 * 60,
      totalBadges: 3,
    });

    const uh3 = await UserHunt.create({
      userId: player3.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      status: "active",
      totalBadges: 1,
    });

    // --- Attempts history (some wrong then right) ---
    await CheckpointAttempt.bulkCreate([
      {
        userHuntId: uh1.id, checkpointId: cs1.id,
        reachedAt: new Date(Date.now() - 58 * 60 * 1000),
        riddleAnswer: "watch", wasCorrect: false, badgeEarned: false,
        attemptLat: cs1.lat, attemptLng: cs1.lng,
      },
      {
        userHuntId: uh1.id, checkpointId: cs1.id,
        reachedAt: new Date(Date.now() - 57 * 60 * 1000),
        riddleAnswer: "clock", wasCorrect: true, badgeEarned: true,
        attemptLat: cs1.lat, attemptLng: cs1.lng,
      },
    ]);

    // === NEW: Seed some earned badges so user_badges isn't empty ===
    // Pick badges by their checkpoint relationships:
    const tutorialBadges = await Badge.findAll({
      where: { checkpointId: { [Op.in]: [tut1.id, tut2.id, tut3.id] } },
    });
    const cityBadges = await Badge.findAll({
      where: { checkpointId: { [Op.in]: [cs1.id, cs2.id, cs3.id] } },
    });

    // Map helpers: title -> id (in case you want stable references)
    const byTitle = (rows) => Object.fromEntries(rows.map(b => [b.title, b.id]));

    const T = byTitle(tutorialBadges);
    const C = byTitle(cityBadges);

    if (UserBadge?.bulkCreate) {
      await UserBadge.bulkCreate([
        // player finished City Secrets → award all three
        { userId: player.id,  badgeId: C["Timekeeper"], earnedAt: new Date(Date.now() - 57 * 60 * 1000) },
        { userId: player.id,  badgeId: C["Sanctuary"],  earnedAt: new Date(Date.now() - 45 * 60 * 1000) },
        { userId: player.id,  badgeId: C["Merchant"],   earnedAt: new Date(Date.now() - 30 * 60 * 1000) },

        // player2 finished City Secrets later
        { userId: player2.id, badgeId: C["Timekeeper"], earnedAt: new Date(Date.now() - 80 * 60 * 1000) },
        { userId: player2.id, badgeId: C["Sanctuary"],  earnedAt: new Date(Date.now() - 60 * 60 * 1000) },
        { userId: player2.id, badgeId: C["Merchant"],   earnedAt: new Date(Date.now() - 40 * 60 * 1000) },

        // player3 started tutorial → earned first badge only
        { userId: player3.id, badgeId: T["Trailhead"],  earnedAt: new Date(Date.now() - 10 * 60 * 1000) },
      ], { ignoreDuplicates: true }); // safe if rerun locally
    }

    // --- Optional: prefill LeaderboardEntry if your model is present ---
    if (typeof LeaderboardEntry !== "undefined" && LeaderboardEntry?.bulkCreate) {
      await LeaderboardEntry.bulkCreate([
        {
          huntId: cityHunt.id,
          userId: player.id,
          completionTime: 30 * 60,
          completionDate: new Date(Date.now() - 30 * 60 * 1000),
        },
        {
          huntId: cityHunt.id,
          userId: player2.id,
          completionTime: 50 * 60,
          completionDate: new Date(Date.now() - 40 * 60 * 1000),
        },
      ]);
    }

    // --- Friends / Notifications / Feedback / Admins (light touch) ---
    if (typeof Friend !== "undefined" && Friend?.create) {
      // Accepted friendship: Player ↔ Player2
      await Friend.create({
        requesterId: player.id,
        receiverId: player2.id,
        status: "accepted",
      });

      // Pending request: Player3 → Player
      await Friend.create({
        requesterId: player3.id,
        receiverId: player.id,
        status: "pending",
      });

      // Rejected request: Player2 → Player3
      await Friend.create({
        requesterId: player2.id,
        receiverId: player3.id,
        status: "rejected",
      });
    }

    if (typeof Notification !== "undefined" && Notification?.bulkCreate) {
      await Notification.bulkCreate([
        { userId: player.id,  message: "You earned Trailhead!", type: "badge" },
        { userId: player2.id, message: "player1 invited you to a hunt.", type: "invite" },
      ]);
    }

    if (typeof HuntFeedback !== "undefined" && HuntFeedback?.create) {
      await HuntFeedback.create({
        huntId: cityHunt.id, userId: player.id,
        rating: 5, comments: "Loved it! Great clues.",
      });
    }

    if (typeof HuntAdmin !== "undefined" && HuntAdmin?.create) {
      await HuntAdmin.create({ huntId: cityHunt.id, userId: creator.id, assignedBy: admin.id });
    }

    // --- Logs ---
    console.log("✅ Seed complete:");
    console.log(`   Tutorial Hunt ID: ${tutorialHunt.id}  Access Code: ${tutorialHunt.accessCode}`);
    console.log(`   City Secrets Hunt ID: ${cityHunt.id}  Access Code: ${cityHunt.accessCode}`);
    console.log(`   Private Hunt ID: ${privateHunt.id}  Access Code: ${privateHunt.accessCode}`);
    console.log(`   Tutorial Start @ lat=${cp1LL.lat.toFixed(6)}, lng=${cp1LL.lng.toFixed(6)}`);
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await sequelize.close();
  }
}

seed();
