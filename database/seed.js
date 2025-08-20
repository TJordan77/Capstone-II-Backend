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
  UserCheckpointProgress, // <-- minimal add: needed for progress seeds
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

    // Extra users you requested
    const tAdmin = await User.create({
      firstName: "T",
      lastName: "J",
      username: "THE_icon",
      email: "iconic@example.com",
      passwordHash: User.hashPassword("Leader1"),
      role: "admin",
      profilePicture: "",
      badgeCount: 5,
    });

    const barAdmin = await User.create({
      firstName: "Bar",
      lastName: "Y",
      username: "baryaakov",
      email: "bary@example.com",
      passwordHash: User.hashPassword("Router1"),
      role: "admin",
      profilePicture: "",
      badgeCount: 5,
    });

    const smedly = await User.create({
      firstName: "Smedly",
      lastName: "M",
      username: "Click_Bait",
      email: "click@example.com",
      passwordHash: User.hashPassword("Click123"),
      role: "player",
      profilePicture: "",
      badgeCount: 5,
    });

    const mohammed = await User.create({
      firstName: "Mohammed",
      lastName: "M",
      username: "Mo-A-Is",
      email: "moham@example.com",
      passwordHash: User.hashPassword("Moham456"),
      role: "player",
      profilePicture: "",
      badgeCount: 5,
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

    const cp1LL = { lat: baseLat, lng: baseLng }; // start point (user location)
    const cp2LL = offsetMeters(baseLat, baseLng, 150, 120); // ~190m NE
    const cp3LL = offsetMeters(baseLat, baseLng, -220, 240); // ~330m NW

    const tutorialHunt = await Hunt.create({
      title: "SideQuest Tutorial",
      description:
        "A short, guided hunt to test GPS, riddles, and progression. Start where you are, then head to two nearby spots.",
      creatorId: creator.id,
      isActive: true,
      isPublished: true,
      version: 1,
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

    // === BADGES (only the ones you listed) ===
    // Attach the checkpoint-specific “first checkpoint” to tutorial CP1
    await Badge.bulkCreate([
      {
        checkpointId: tut1.id,
        title: "Trailblazer",
        description: "First checkpoint completed",
        image: "/icon-trailblazer.png",
      },
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

    // (No city-specific badges; we stick to your defined set)

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

    // Existing two checkpoints
    const p1 = await Checkpoint.create({
      huntId: privateHunt.id, order: 1,
      title: "Stage Door", riddle: "Knock thrice.", answer: "knock",
      lat: baseLat - 0.0002, lng: baseLng + 0.0003, tolerance: 25
    });
    const p2 = await Checkpoint.create({
      huntId: privateHunt.id, order: 2,
      title: "Green Room", riddle: "Color of calm.", answer: "green",
      lat: baseLat - 0.0003, lng: baseLng + 0.0005, tolerance: 25
    });

    // Add placeholder checkpoints so each global badge has a host
    const p3 = await Checkpoint.create({
      huntId: privateHunt.id, order: 3,
      title: "After Hours", riddle: "Night creatures rise.", answer: "owl",
      lat: baseLat - 0.0004, lng: baseLng + 0.0006, tolerance: 25
    });
    const p4 = await Checkpoint.create({
      huntId: privateHunt.id, order: 4,
      title: "On a Roll", riddle: "Keep the streak.", answer: "streak",
      lat: baseLat - 0.0005, lng: baseLng + 0.0007, tolerance: 25
    });
    const p5 = await Checkpoint.create({
      huntId: privateHunt.id, order: 5,
      title: "Full Run", riddle: "Finish the journey.", answer: "finish",
      lat: baseLat - 0.0006, lng: baseLng + 0.0008, tolerance: 25
    });
    const p6 = await Checkpoint.create({
      huntId: privateHunt.id, order: 6,
      title: "Speed Check", riddle: "Beat the clock.", answer: "fast",
      lat: baseLat - 0.0007, lng: baseLng + 0.0009, tolerance: 25
    });

    if (typeof HuntInvite !== "undefined" && HuntInvite?.create) {
      await HuntInvite.create({ huntId: privateHunt.id, code: "PRIVATE7" });
    }

    // Attach remaining official badges (exactly what you listed)
    await Badge.bulkCreate([
      { checkpointId: p1.id, title: "Night Owl",        description: "Completed a hunt between 10PM–6AM",                     image: "/icon-nightowl.png" },
      { checkpointId: p2.id, title: "Ghost Hunter",     description: "Completed hidden (invite-only) hunt",                    image: "/icon-ghosthunter.png" },
      { checkpointId: p3.id, title: "Beta Tester",      description: "Participated in the first 10 SideQuest hunts ever",      image: "/icon-betatester.png" },
      { checkpointId: p4.id, title: "Streak Master",    description: "Completed 3+ hunts in 3 days",                           image: "/icon-streakmaster.png" },
      { checkpointId: p5.id, title: "Pathfinder",       description: "First full hunt completed",                              image: "/icon-pathfinder.png" },
      { checkpointId: p6.id, title: "Speedrunner",      description: "Completed hunt under X mins",                            image: "/icon-speedrunner.png" },
      { checkpointId: tut2.id, title: "Sharp Eye",      description: "Solved all clues with no hints",                         image: "/icon-sharpeye.png" },
      { checkpointId: tut3.id, title: "Badge Collector",description: "Earned 5+ badges total",                                 image: "/icon-badge-collector.png" },
    ]);

    // --- UserHunt (drives leaderboard fallback) ---
    const uh1 = await UserHunt.create({
      userId: player.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),   // 1h ago
      completedAt: new Date(Date.now() - 30 * 60 * 1000), // 30m ago
      status: "completed",
      totalTimeSeconds: 30 * 60,
      totalBadges: 0,
    });

    const uh2 = await UserHunt.create({
      userId: player2.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 90 * 60 * 1000),
      completedAt: new Date(Date.now() - 40 * 60 * 1000),
      status: "completed",
      totalTimeSeconds: 50 * 60,
      totalBadges: 0,
    });

    const uh3 = await UserHunt.create({
      userId: player3.id,
      huntId: cityHunt.id,
      startedAt: new Date(Date.now() - 20 * 60 * 1000),
      status: "active",
      totalBadges: 0,
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
        riddleAnswer: "clock", wasCorrect: true, badgeEarned: false,
        attemptLat: cs1.lat, attemptLng: cs1.lng,
      },
    ]);

    // === Seed a couple earned badges so user_badges isn't empty ===
    const allBadges = await Badge.findAll({ attributes: ["id", "title"] });
    const byTitle = (rows) => Object.fromEntries(rows.map(b => [b.title, b.id]));
    const B = byTitle(allBadges);

    if (UserBadge?.bulkCreate) {
      await UserBadge.bulkCreate(
        [
          // player3 earned Trailblazer (imagine they solved tutorial CP1)
          { userId: player3.id, badgeId: B["Trailblazer"], earnedAt: new Date(Date.now() - 10 * 60 * 1000) },
        ],
        { ignoreDuplicates: true }
      );
    }

    // === Grant ALL badges to THE_icon, baryaakov, Click_Bait; Mohammed gets Night Owl only ===
    const grantAll = async (userId) => {
      await UserBadge.bulkCreate(
        allBadges.map(b => ({ userId, badgeId: b.id })),
        { ignoreDuplicates: true }
      );
    };
    await grantAll(tAdmin.id);
    await grantAll(barAdmin.id);
    await grantAll(smedly.id);

    if (B["Night Owl"]) {
      await UserBadge.findOrCreate({
        where: { userId: mohammed.id, badgeId: B["Night Owl"] },
        defaults: { userId: mohammed.id, badgeId: B["Night Owl"] },
      });
    }

    // === Showcase Extras (inside seed, minimal) ===
    // One more public hunt + progress + badges to make demo lively
    const campusHunt = await Hunt.create({
      title: "Campus Trail",
      description: "A brisk loop across three landmarks.",
      creatorId: creator.id,
      isActive: true,
      isPublished: true,
      version: 1,
      visibility: "public",
      endsAt: new Date(Date.now() + 5 * 24 * 3600 * 1000),
      maxPlayers: 150,
      coverUrl: "https://picsum.photos/seed/campus/1200/600",
      accessCode: generateAccessCode(),
    });

    const cam1 = await Checkpoint.create({
      huntId: campusHunt.id, order: 1,
      title: "Library Steps", riddle: "Where pages turn but feet don’t.",
      answer: "library", lat: baseLat + 0.00025, lng: baseLng + 0.00035, tolerance: 30
    });
    const cam2 = await Checkpoint.create({
      huntId: campusHunt.id, order: 2,
      title: "Bell Tower", riddle: "I mark the hours in song.",
      answer: "tower", lat: baseLat + 0.00055, lng: baseLng + 0.00010, tolerance: 30
    });
    const cam3 = await Checkpoint.create({
      huntId: campusHunt.id, order: 3,
      title: "Quad Arch", riddle: "Pass through me to learn.",
      answer: "arch", lat: baseLat + 0.00075, lng: baseLng - 0.00025, tolerance: 30
    });

    // Helper to grant by title using B
    async function grant(userId, title, when = new Date()) {
      if (!B[title]) return;
      await UserBadge.findOrCreate({
        where: { userId, badgeId: B[title] },
        defaults: { userId, badgeId: B[title], earnedAt: when },
      });
    }

    // Player finishes 3 hunts on 3 different days (Streak look)
    const day = 24 * 3600 * 1000;

    // Ensure city secrets completion “today”
    if (uh1) {
      uh1.startedAt = new Date(Date.now() - (60 * 60 * 1000));
      uh1.completedAt = new Date(Date.now() - (30 * 60 * 1000));
      uh1.totalTimeSeconds = 30 * 60;
      await uh1.save();
    }

    // Tutorial completion “yesterday”
    const tutFinishStart = new Date(Date.now() - (day + 45 * 60 * 1000));
    const tutFinishEnd   = new Date(Date.now() - (day + 25 * 60 * 1000));
    const uhTutorial = await UserHunt.create({
      userId: player.id,
      huntId: tutorialHunt.id,
      startedAt: tutFinishStart,
      completedAt: tutFinishEnd,
      status: "completed",
      totalTimeSeconds: Math.floor((tutFinishEnd - tutFinishStart)/1000),
    });

    // Campus run in 18 minutes (Speedrunner demo)
    const campusStart = new Date(Date.now() - (22 * 60 * 1000));
    const campusEnd   = new Date(Date.now() - (4 * 60 * 1000));
    const uhCampus = await UserHunt.create({
      userId: player.id,
      huntId: campusHunt.id,
      startedAt: campusStart,
      completedAt: campusEnd,
      status: "completed",
      totalTimeSeconds: 18 * 60,
    });

    // Mid-run progress for player2 on Campus
    const uhCampusP2 = await UserHunt.create({
      userId: player2.id,
      huntId: campusHunt.id,
      startedAt: new Date(Date.now() - (50 * 60 * 1000)),
      status: "active",
    });
    await UserCheckpointProgress.bulkCreate([
      { userHuntId: uhCampusP2.id, checkpointId: cam1.id, attemptsCount: 2, solvedAt: new Date(Date.now() - (40 * 60 * 1000)) },
      { userHuntId: uhCampusP2.id, checkpointId: cam2.id, attemptsCount: 1, solvedAt: null },
    ]);

    // Leaderboard entries for the new hunt
    if (typeof LeaderboardEntry !== "undefined" && LeaderboardEntry?.bulkCreate) {
      await LeaderboardEntry.bulkCreate([
        { huntId: campusHunt.id, userId: player.id,  completionTime: 18 * 60, completionDate: campusEnd },
        { huntId: campusHunt.id, userId: player2.id, completionTime: null,     completionDate: null },
      ]);
    }

    // Showcase earned badges
    await grant(player.id, "Trailblazer", tutFinishEnd);
    await grant(player.id, "Pathfinder",  campusEnd);
    await grant(player.id, "Speedrunner", campusEnd);
    await grant(player.id, "Streak Master", new Date());

    await grant(player2.id, "Trailblazer", new Date(Date.now() - (40 * 60 * 1000)));

    // Activity notifications
    if (typeof Notification !== "undefined" && Notification?.bulkCreate) {
      await Notification.bulkCreate([
        { userId: player.id,  message: "Speedrunner unlocked on Campus Trail!", type: "badge" },
        { userId: player2.id, message: "Checkpoint solved on Campus Trail",     type: "progress" },
      ]);
    }

    // --- Logs ---
    console.log("✅ Seed complete:");
    console.log(`   Tutorial Hunt ID: ${tutorialHunt.id}  Access Code: ${tutorialHunt.accessCode}`);
    console.log(`   City Secrets Hunt ID: ${cityHunt.id}  Access Code: ${cityHunt.accessCode}`);
    console.log(`   Private Hunt ID: ${privateHunt.id}  Access Code: ${privateHunt.accessCode}`);
    console.log(`   Campus Trail Hunt ID: ${campusHunt.id}  Access Code: ${campusHunt.accessCode}`);
    console.log(`   Tutorial Start @ lat=${cp1LL.lat.toFixed(6)}, lng=${cp1LL.lng.toFixed(6)}`);
  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await sequelize.close();
  }
}

seed();
