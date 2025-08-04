const { db } = require("./index");
const { User, Hunt, Checkpoint, Badge } = require("./index");

async function seed() {
  try {
    await db.sync({ force: true });
    console.log("🌱 Database synced");

    // Create users
    const admin = await User.create({
      firstName: "Alice",
      lastName: "Admin",
      email: "admin@example.com",
      passwordHash: User.hashPassword("admin123"),
      role: "admin",
      profilePicture: "",
      badgeCount: 0,
    });

    const creator = await User.create({
      firstName: "Charlie",
      lastName: "Creator",
      email: "creator@example.com",
      passwordHash: User.hashPassword("creator123"),
      role: "creator",
      profilePicture: "",
      badgeCount: 0,
    });

    const player = await User.create({
      firstName: "Penny",
      lastName: "Player",
      email: "player@example.com",
      passwordHash: User.hashPassword("player123"),
      role: "player",
      profilePicture: "",
      badgeCount: 0,
    });

    // Create a hunt
    const hunt = await Hunt.create({
      title: "Downtown Mystery Hunt",
      description: "A GPS scavenger challenge across city landmarks.",
      isActive: true,
      creatorId: creator.id,
    });

    // Create checkpoints
    const cp1 = await Checkpoint.create({
      huntId: hunt.id,
      order: 1,
      riddle: "Find the place where books are free and stories live forever.",
      hint: "Public library entrance",
      lat: 40.7128,
      lng: -74.006,
    });

    const cp2 = await Checkpoint.create({
      huntId: hunt.id,
      order: 2,
      riddle:
        "Next stop: where love locks line the rails and rivers flow below.",
      hint: "Footbridge with locks",
      lat: 40.7131,
      lng: -74.007,
    });

    // Create badges
    await Badge.create({
      checkpointId: cp1.id,
      title: "Story Seeker",
      description: "Unlocked the library clue!",
      image: "/badges/library.png",
    });

    await Badge.create({
      checkpointId: cp2.id,
      title: "Bridge Breaker",
      description: "Found the hidden clue by the river!",
      image: "/badges/bridge.png",
    });

    console.log("✅ Seed complete");
    process.exit();
  } catch (err) {
    console.error("❌ Seed error:", err);
    process.exit(1);
  }
}

seed();
