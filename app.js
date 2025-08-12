require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();

app.set('trust proxy', 1); // so "secure" cookies behave behind Vercel's proxy

const apiRouter = require("./api");
const { router: authRouter } = require("./auth");
const adminRouter = require("./api/admin");
const { db } = require("./database");
// const initSocketServer = require("./socket-server");  // Prevent socket server from going on startup
const PORT = process.env.PORT || 8000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const { sseMiddleware } = require("./sse");

// Security headers
const helmet = require("helmet");
app.use(helmet({ contentSecurityPolicy: false })); // gonna start with relaxed CSP; tune later

// Enable CORS middleware for frontend
// Enable strict CORS allow-list
// See middleware/cors.js for the centralized allow-list & options
const secureCors = require("./middleware/cors");
app.use(secureCors); // <— replaces the open regex CORS

// Note: certain app.use middleware should be near top in this section
// body parser middleware
app.use(express.json());

// cookie parser middleware
app.use(cookieParser());

// CSRF protection: mount globally (enforced on non-GET by default)
const { csrfProtection, sendCsrfToken, csrfErrorHandler } = require("./middleware/csrf");
app.use(csrfProtection);

// Note: This route works fine on Vercel; 
// it streams responses and auto‑reconnects on the client.
// Stream endpoint clients subscribe to:
app.get("/api/events", sseMiddleware);

app.use(morgan("dev")); // logging middleware
app.use(express.static(path.join(__dirname, "public"))); // serve static files from public folder
app.get("/auth/csrf", sendCsrfToken); // Endpoint to fetch a CSRF token (client calls once at app start)
app.use("/api", apiRouter); // mount api router
app.use("/auth", authRouter); // mount auth router
app.use("/admin", adminRouter); // mount admin router

// CSRF error handler
app.use(csrfErrorHandler);

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

   // On Vercel (serverless), just authenticate. Locally, sync as before.
    if (require.main === module) {
      await db.sync({ alter: true });
      console.log("✅ DB synced (local dev)");
    } else {
      await db.authenticate();
      console.log("✅ DB authenticated (serverless)");
    }

    // Only start the HTTP server when running locally
    if (require.main === module) {
      const server = app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
      });
      // sockets only in standalone local mode
      // initSocketServer(server);
    }
  } catch (err) {
    console.error("❌ Unable to connect to the database:", err);
  }
};

runApp();

module.exports = app;
