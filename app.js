require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const app = express();
const apiRouter = require("./api");
const { router: authRouter } = require("./auth");
const db = require("./database/db"); //Test this
const adminRoutes = require("./api/admin");
const { db } = require("./database");
const initSocketServer = require("./socket-server");
const PORT = process.env.PORT || 8080;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// Note: certain app.use middleware should be near top in this section
// body parser middleware
app.use(express.json());

// cookie parser middleware
app.use(cookieParser());

// Enable CORS middleware for frontend
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);


app.use(morgan("dev")); // logging middleware
app.use(express.static(path.join(__dirname, "public"))); // serve static files from public folder
app.use("/api", apiRouter); // mount api router
app.use("/auth", authRouter); // mount auth router
app.use("/admin", adminRoutes); // mount admin routes

// Protected route middleware
// verifies JWT and restricts access to users with the specified role (e.g. 'admin')
const { requireAuth, requireRole } = require("./middleware/authMiddleware");
// Quick role test route
app.get("/admin", requireAuth, requireRole("admin"), (req, res) => {
  res.send("You are an admin!"); 
});


// error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.sendStatus(500);
});

const runApp = async () => {
  try {
    // Note: no need to require all the models like this, just use ./database to call them all
    // Make sure they're centralized in database/index.js and we're good
    require("./database/user");
    require("./database/hunt");

    await db.sync({ alter: true });

    console.log("✅ Connected to the database");
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
    });

    initSocketServer(server);
    console.log("🧦 Socket server initialized");
  } catch (err) {
    console.error("❌ Unable to connect to the database:", err);
  }
};

runApp();

module.exports = app;
