require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const path = require("path");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();

// ADDED: exact-origin CORS shim to avoid '*' with credentials
const allowlist = new Set([
  "http://localhost:3000",
  process.env.FRONTEND_URL, // e.g. https://capstone-ii-frontend.vercel.app or your current preview URL
].filter(Boolean));
const vercelPreviewRe = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowlist.has(origin) || vercelPreviewRe.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);     // overwrite any '*'
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    // FIXED: header name had a double dash
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"); // FIXED
    // ADDED: echo requested headers so x-requested-with (and others) are allowed
    const reqHeaders = req.headers["access-control-request-headers"];
    res.setHeader("Access-Control-Allow-Headers", reqHeaders || "Content-Type, X-CSRF-Token, Authorization, X-Requested-With"); // ADDED
    return res.sendStatus(204);
  }
  next();
});

app.set('trust proxy', 1); // so "secure" cookies behave behind Vercel's proxy

const apiRouter = require("./api");
const { router: authRouter } = require("./auth");
const adminRouter = require("./api/admin");
const { db } = require("./database");
// const initSocketServer = require("./socket-server");  // Prevent socket server from going on startup
const PORT = process.env.PORT || 8080;
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

// ADDED: one-time schema sync endpoint (protected with a secret)
// NOTE: this must be BEFORE app.use(csrfProtection)
app.post("/api/admin/sync", async (req, res) => {
  try {
    // simple protection: require a header that matches an env secret
    if (req.headers["x-admin-key"] !== process.env.ADMIN_SYNC_KEY) {
      return res.status(403).json({ error: "forbidden" });
    }

    // No need to require each model individually — database folder already did it
    await db.authenticate();
    // WARNING: alter modifies tables in-place; safe for first deploy
    await db.sync({ alter: true });
    return res.json({ ok: true });
  } catch (e) {
    console.error("admin/sync error:", e);
    return res.status(500).json({ ok: false, error: e?.message });
  }
});

// CSRF protection: mount globally (enforced on non-GET by default)
const { csrfProtection, sendCsrfToken, csrfErrorHandler } = require("./middleware/csrf");
app.use(csrfProtection);

// Note: This route works fine on Vercel; 
// it streams responses and auto-reconnects on the client.
// Stream endpoint clients subscribe to:
app.get("/api/events", sseMiddleware);

app.use(morgan("dev")); // logging middleware
app.use(express.static(path.join(__dirname, "public"))); // serve static files from public folder

// CHANGED: prefix CSRF endpoint with /api to align with mounted /api/auth routes used by the frontend
app.get("/api/auth/csrf", sendCsrfToken); // CHANGED

app.use("/api", apiRouter); // mount api router
app.use("/api/auth", authRouter); // mount auth router
app.use("/api/admin", adminRouter); // mount admin router

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
