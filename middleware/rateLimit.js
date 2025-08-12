const rateLimit = require("express-rate-limit");

const commonOpts = {
  standardHeaders: true,
  legacyHeaders: false,
};

exports.loginLimiter = rateLimit({
  ...commonOpts,
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,                  // 10 attempts / 10 min / IP
  message: { error: "Too many login attempts. Try again later." },
});

exports.signupLimiter = rateLimit({
  ...commonOpts,
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { error: "Too many signups from this IP. Try again later." },
});

exports.oauthLimiter = rateLimit({
  ...commonOpts,
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: { error: "Too many OAuth requests. Try again later." },
});
