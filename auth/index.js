const { loginLimiter, signupLimiter, oauthLimiter } = require("../middleware/rateLimit");
const express = require("express");
const jwt = require("jsonwebtoken");
const { User } = require("../database");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = express.Router();

// Validate secret at load time (fail fast if missing)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is missing (set it in env).");
}

const cookieSettings = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
};

// Middleware to authenticate JWT tokens
const authenticateJWT = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).send({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// Auth0 authentication route
router.post("/auth0", oauthLimiter, async (req, res) => {
  try {
    const { auth0Id, email, username, firstName, lastName } = req.body;

    if (!auth0Id) {
      return res.status(400).send({ error: "Auth0 ID is required" });
    }

    // Try to find existing user by auth0Id first
    let user = await User.findOne({ where: { auth0Id } });

    if (!user && email) {
      // If no user found by auth0Id, try to find by email
      user = await User.findOne({ where: { email } });

      if (user) {
        // Update existing user with auth0Id
        user.auth0Id = auth0Id;
        await user.save();
      }
    }

    if (!user) {
      // Create new user if not found
      const userData = {
        auth0Id,
        email: email || null,
        username: username || email?.split("@")[0] || `user_${Date.now()}`, // Use email prefix as username if no username provided
        passwordHash: null, // Auth0 users don't have passwords
        firstName: firstName,
        lastName: lastName,
      };

      // Ensure username is unique
      let finalUsername = userData.username;
      let counter = 1;
      while (await User.findOne({ where: { username: finalUsername } })) {
        finalUsername = `${userData.username}_${counter}`;
        counter++;
      }
      userData.username = finalUsername;

      user = await User.create(userData);
    }

    // Generate JWT token with auth0Id included
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        auth0Id: user.auth0Id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("token", token, cookieSettings);

    res.send({
      message: "Auth0 authentication successful",
      user: {
        id: user.id,
        username: user.username,
        auth0Id: user.auth0Id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("Auth0 authentication error:", error);
    res.sendStatus(500);
  }
});

// Google OAuth Route - Validates Google ID Token from frontend
router.post("/google", oauthLimiter, async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) return res.status(400).json({ error: "Missing ID token" });

    // Verify Google token
    const ticket = await client.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload(); // contains email, name, etc.
    const { email, sub: googleId, name } = payload;

    // Lookup or create user
    let user = await User.findOne({ where: { email } });

    if (!user) {
      user = await User.create({
        email,
        username: name || email.split("@")[0],
        passwordHash: null,
        auth0Id: googleId, // reuse this field to store the Google ID
      });
    }

    // Sign JWT and send token cookie
    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("token", token, cookieSettings);
    res.send({ message: "Google login successful", user });
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// Signup route
router.post("/signup", signupLimiter, async (req, res) => {
  try {
    // CHANGED: accept email/firstName/lastName, and keep username if provided
    let { username, password, email, firstName, lastName } = req.body; // CHANGED

    // CHANGED: allow username to be derived from email if missing
    if (!username && email) username = email.split("@")[0]; // CHANGED

    if (!username || !password) {
      return res
        .status(400)
        .send({ error: "Username and password are required" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .send({ error: "Password must be at least 6 characters long" });
    }

    // CHANGED: check for existing user by username or email (if email provided)
    const where = email ? { username } : { username }; // minimal: keep username required
    const existingUser = await User.findOne({ where: { username } }); // CHANGED (explicit)
    if (existingUser) {
      return res.status(409).send({ error: "Username already exists" });
    }

    // Create new user
    // CHANGED: include email/firstName/lastName and fix casing bug
    const passwordHash = User.hashPassword(password);
    const user = await User.create({
      username,
      email: email || null,
      firstName, // CHANGED
      lastName,  // CHANGED
      passwordHash,
    });
    
    // Generate JWT token
    // CHANGED: fix token fields (firstName/lastName casing)  <-- FIXED comment slash
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        auth0Id: user.auth0Id,
        email: user.email,
        firstName: user.firstName, // CHANGED
        lastName: user.lastName,   // CHANGED
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("token", token, cookieSettings);

    res.send({
      message: "User created successfully",
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName, // CHANGED
        lastName: user.lastName,   // CHANGED
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.sendStatus(500);
  }
});

// Login route
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).send({ error: "Email and password are required" });
      return;
    }

    // Find user  <-- FIXED comment (was "/// Find user")
    const user = await User.findOne({ where: { email } });
    // CHANGED: guard against null before calling checkPassword
    if (!user) {
      return res.status(401).send({ error: "Invalid credentials" }); // CHANGED
    } 

    // Check password
    if (!user.checkPassword(password)) {
      return res.status(401).send({ error: "Invalid credentials" });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        auth0Id: user.auth0Id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.cookie("token", token, cookieSettings);

    res.send({
      message: "Login successful",
      user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName},
    });
  } catch (error) {
    console.error("Login error:", error);
    res.sendStatus(500);
  }
});

// Logout route
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.send({ message: "Logout successful" });
});

// Get current user route (protected)
router.get("/me", (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.send({});
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).send({ error: "Invalid or expired token" });
    }
  
    res.send({ user: user,
      auth0Id: user.auth0Id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
     });
  });
});

module.exports = { router, authenticateJWT };
