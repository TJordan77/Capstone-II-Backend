const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const { User } = require("../database");

// Middleware: Require valid JWT (from cookies)
async function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: "No token provided." });
  }

  try {
    // verify synchronously; throws if invalid/expired
    const decoded = jwt.verify(token, JWT_SECRET);

    // hydrate role from DB (keeps token small)
    const fresh = await User.findByPk(decoded.id, {
      attributes: ["id", "username", "role"],
    });

    req.user = { ...decoded, role: fresh?.role || "player" };
    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}

// Middleware: Restrict route by user role
function requireRole(role) {
  return function (req, res, next) {
    if (!req.user || req.user.role !== role) {
      return res
        .status(403)
        .json({ error: "Access denied. Role required: " + role });
    }
    next();
  };
}

// Allow multiple roles (e.g., ["admin", "creator"])
function requireAnyRole(roles = []) {
  return function (req, res, next) {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error:
          "Access denied. One of the following roles required: " +
          roles.join(", "),
      });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requireAnyRole };
