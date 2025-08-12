const csrf = require("csurf");

const isProd = process.env.NODE_ENV === "production";

const csrfProtection = csrf({
  cookie: {
    httpOnly: true,           // secret stored in httpOnly cookie
    sameSite: isProd ? "none" : "lax",
    secure: isProd,
  },
});

// Helper route handler to issue a CSRF token to the client
const sendCsrfToken = (req, res) => {
  const csrfToken = req.csrfToken();
  // Future ref: set a readable cookie later if preferred:
  // res.cookie("XSRF-TOKEN", csrfToken, { sameSite: isProd ? "none" : "lax", secure: isProd });
  res.json({ csrfToken });
};

// CSRF error handler (plug into app.js after routes/middleware)
const csrfErrorHandler = (err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next(err);
};

module.exports = { csrfProtection, sendCsrfToken, csrfErrorHandler };
