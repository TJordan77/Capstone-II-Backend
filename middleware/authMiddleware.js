const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Middleware: Require valid JWT (from cookies)
function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No token provided." });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid or expired token." });
    }
    req.user = user; // Attach decoded user object to request
    next();
  });
}

// Middleware: Restrict route by user role
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: "Access denied. Role required: " + role });
    }
    next();
  };
}

// Tossing in for the optional ask: Allow multiple roles (e.g. ["admin", "creator"])
function requireAnyRole(roles = []) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Access denied. One of the following roles required: " + roles.join(", ") });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAnyRole
};
