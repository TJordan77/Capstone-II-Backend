// Centralized CORS config with a strict allow-list of frontend origins.
// Helps protect cookie-based auth (and mitigate CSRF) by only accepting requests from trusted URLs.
const cors = require("cors");

// Allow both local dev and deployed frontend
const ALLOWLIST = [
  "http://localhost:3000",
  process.env.FRONTEND_URL, 
].filter(Boolean);

// Also allow Vercel preview URLs- enable later
// const VERCEL_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const options = {
  origin(origin, cb) {
    // No Origin header (e.g., same-origin, curl) -> allow
    if (!origin) return cb(null, true);

    const allowed =
      ALLOWLIST.includes(origin) || VERCEL_PREVIEW_RE.test(origin);

    return cb(allowed ? null : new Error(`CORS blocked: ${origin}`), allowed);
  },
  credentials: true, // REQUIRED for cookies
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "X-CSRF-Token", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

module.exports = cors(options);
