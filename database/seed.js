const db = require("./db");
const { User } = require("./index");
const { Hunt } = require("./hunt");

const seed = async () => {
  try {
    db.logging = false;
    await db.sync({ force: true }); // Drop and recreate tables

    const users = await User.bulkCreate([
      { firstName: "admin", lastName:"", username: "admin", passwordHash: User.hashPassword("admin123") },
      { firstName: "user1", lastName:"", username: "user1", passwordHash: User.hashPassword("user111") },
      { firstName: "user2", lastName:"", username: "user2", passwordHash: User.hashPassword("user222") },
    ]);

    const hunts = await Hunt.bulkCreate([
      {
        id: 1,
        creator_id: 1,
        title: "First Hunt",
        isActive: true,
        isPublished: true,
        accessCode: "Hunt1",
        oroginalHuntId: null,
      },
      {
        id: 2,
        creator_id: 1,
        title: "Second Hunt",
        isActive: true,
        isPublished: true,
        accessCode: "Hunt2",
        oroginalHuntId: null,
      },
      {
        id: 3,
        creator_id: 1,
        title: "Third Hunt",
        isActive: true,
        isPublished: true,
        accessCode: "Hunt3",
        oroginalHuntId: null,
      },
    ]);

    console.log(`👤 Created ${users.length} users`);

    // Create more seed data here once you've created your models
    // Seed files are a great way to test your database schema!

    console.log("🌱 Seeded the database");
  } catch (error) {
    console.error("Error seeding database:", error);
    if (error.message.includes("does not exist")) {
      console.log("\n🤔🤔🤔 Have you created your database??? 🤔🤔🤔");
    }
  }
  db.close();
};

seed();
