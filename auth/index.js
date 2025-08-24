const { loginLimiter, signupLimiter, oauthLimiter } = require("../middleware/rateLimit");
const express = require("express");
const jwt = require("jsonwebtoken");
const { User } = require("../database");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ADDED: jose is ESM-only; gotta load it via dynamic import in CJS
let _jose; 
const loadJose = async () => (_jose ??= await import("jose"));

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;           
const AUTH0_AUDIENCE = process.env_AUTH0_AUDIENCE || process.env.AUTH0_AUDIENCE;   // ADDED: tolerate either var name just in case

// ADDED: lazy JWKS cache (works well on Vercel function warm invocations)
let JWKS = null;
const getJWKS = async () => { 
  if (!AUTH0_DOMAIN) return null;
  if (!JWKS) {
    const { createRemoteJWKSet } = await loadJose();
    JWKS = createRemoteJWKSet(
      new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
    );
  }
  return JWKS;
};     


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
// ADDED: Now verifies the Auth0 ID token via JWKS instead of trusting client-provided IDs/emails
router.post("/auth0", oauthLimiter, async (req, res) => {
  try {
    const { id_token } = req.body;
    if (!id_token) {
      return res.status(400).send({ error: "Missing id_token" });
    }
    if (!AUTH0_DOMAIN) {
      return res.status(500).send({ error: "AUTH0_DOMAIN not configured" });
    }
    if (!AUTH0_AUDIENCE) {
      return res.status(500).send({ error: "AUTH0_AUDIENCE not configured" });
    }

    // ADDED: Verify the Auth0 ID token via dynamic import + lazy JWKS
    const { jwtVerify } = await loadJose();            
    const jwks = await getJWKS();                         
    const { payload } = await jwtVerify(id_token, jwks, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_AUDIENCE, // For ID tokens, this should be your SPA Client ID
    });                                             

    // ADDED: Extract trusted user info from verified token
    const auth0Id = payload.sub; // "auth0|xxxx"
    const email = payload.email || null;
    const firstName = payload.given_name || "Player";
    const lastName  = payload.family_name || "One";
    let username = email ? email.split("@")[0] : `user_${Date.now()}`;

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
        username: username, // Use email prefix as username if available
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
      { expiresIn: "24h" } // keeping a 24h window
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
    return res.status(401).json({ error: "Invalid Auth0 token" }); // clearer status for verification failure
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
        // NOTE: may consider a dedicated column later (e.x., googleId) to avoid provider collisions
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
    let { username, password, email, firstName, lastName } = req.body; 

    // CHANGED: allow username to be derived from email if missing
    if (!username && email) username = email.split("@")[0]; 

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
    const existingUser = await User.findOne({ where: { username } }); 
    if (existingUser) {
      return res.status(409).send({ error: "Username already exists" });
    }

    // ADDED: prevent duplicate email if provided
    if (email) {
      const existingByEmail = await User.findOne({ where: { email } }); 
      if (existingByEmail) {
        return res.status(409).send({ error: "Email already in use" }); 
      }
    }

    // Create new user
    // CHANGED: include email/firstName/lastName and fix casing bug
    const passwordHash = User.hashPassword(password);
    const user = await User.create({
      username,
      email: email || null,
      firstName, 
      lastName,  
      passwordHash,
    });
    
    // Generate JWT token
    // CHANGED: fix token fields (firstName/lastName casing)  
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
      message: "User created successfully",
      user: {
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,  
        email: user.email, 
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
    // ADDED: allow either email OR username via "identifier", while keeping the existing "email" support
    const { identifier, email, password } = req.body; 
    const key = identifier || email;                  

    if (!key || !password) {
      res.status(400).send({ error: "Email/username and password are required" });
      return;
    }

    // Find user 
    const where = key.includes("@") ? { email: key } : { username: key };
    const user = await User.findOne({ where });
    // CHANGED: guard against null before calling checkPassword
    if (!user) {
      return res.status(401).send({ error: "Invalid credentials" });
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
      user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email }, // ADDED email
    });
  } catch (error) {
    console.error("Login error:", error);
    res.sendStatus(500);
  }
});

// Logout route
router.post("/logout", (req, res) => {
  // ADDED: clear cookie with same site/secure/path so it actually clears on Vercel
  res.clearCookie("token", {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  });
  res.send({ message: "Logout successful" });
});

// Get current user route (protected)
router.get("/me", (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.send({});
  }

  // Fetch the fresh user from DB after verifying token
  jwt.verify(token, JWT_SECRET, async (err, user) => { // Make callback async
    if (err) {
      return res.status(403).send({ error: "Invalid or expired token" });
    }

    try {
      const dbUser = await User.findByPk(user.id, {
        attributes: ["id", "email", "username", "firstName", "lastName", "auth0Id", "profilePicture"],
      }); 
      if (!dbUser) return res.send({}); 

      // Return both names for compatibility
      const u = dbUser.toJSON();
      u.avatarUrl = u.profilePicture || null;
      
      // avoid stale/cached /me responses across sessions
      res.set("Cache-Control", "private, no-store, must-revalidate");
      res.set("Vary", "Cookie");

      // Return normalized user object
      res.send({ user: dbUser }); 
    } catch (e) {
      console.error("ME lookup error:", e); 
      res.status(500).send({ error: "Server error" });
    }
  });
});

// Profile updater
router.put("/profile", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).send({ error: "Not authenticated" });

    const u = await User.findByPk(userId);
    if (!u) return res.status(404).send({ error: "User not found" });

    const { name, email, profilePicture } = req.body || {};

    if (typeof name === "string" && name.trim()) {
      const parts = name.trim().split(/\s+/);
      u.firstName = parts.shift() || u.firstName;
      u.lastName = parts.length ? parts.join(" ") : u.lastName;
    }
    if (typeof email === "string" && email.trim()) u.email = email.trim();
    if (typeof profilePicture === "string" && profilePicture.length) {
      u.profilePicture = profilePicture;
    }

    await u.save();

    const out = {
      id: u.id,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profilePicture: u.profilePicture || null,
      avatarUrl: u.profilePicture || null, // alias for any UI reading avatarUrl
    };

    res.set("Cache-Control", "private, no-store, must-revalidate");
    res.set("Vary", "Cookie");

    res.send({ message: "Profile updated", user: out });
  } catch (e) {
    console.error("PUT /api/auth/profile failed:", e);
    res.status(500).send({ error: "Failed to update profile" });
  }
});

module.exports = { router, authenticateJWT };
