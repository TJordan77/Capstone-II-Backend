// Centralized CORS config with a strict allow-list of frontend origins.
// Helps protect cookie-based auth (and mitigate CSRF) by only accepting requests from trusted URLs.
const cors = require("cors");

const allowedOrigins = [
  process.env.FRONTEND_URL,                      // our vercel link
  process.env.FRONTEND_URL_LOCAL || "http://localhost:3000",
  // We can add any preview domains to allow here later:
  // "https://capstone-frontend-git-branch-user.vercel.app",
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    // Allow server-to-server / curl (no origin), and allowed origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
};

module.exports = cors(corsOptions);
