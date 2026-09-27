import mongoose from "mongoose";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";
import { validateUsername, validatePassword } from "../util/authValidation.js";

const router = Router();

const DB_UP = () => mongoose.connection.readyState === 1;
const COOKIE = "wiki.sid";

// Fresh session id on privilege change (anti-fixation), then persist.
async function startLoggedInSession(req, userId) {
  await new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
  req.session.userId = userId;
  await new Promise((resolve, reject) =>
    req.session.save((err) => (err ? reject(err) : resolve()))
  );
}

// POST /api/auth/register — create an account and log in immediately.
router.post("/register", async (req, res) => {
  const { username, password } = req.body ?? {};
  const uErr = validateUsername(username);
  if (uErr) return res.status(400).json({ error: uErr });
  const pErr = validatePassword(password);
  if (pErr) return res.status(400).json({ error: pErr });
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });

  try {
    const uname = username.trim().toLowerCase();
    const existing = await User.findOne({ username: uname }).lean();
    if (existing) return res.status(409).json({ error: "username already taken" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ username: uname, passwordHash });
    await startLoggedInSession(req, user._id.toString());
    res.status(201).json({ user: { id: user._id, username: user.username } });
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "username already taken" });
    console.error("[auth] register failed:", err);
    res.status(500).json({ error: "registration failed" });
  }
});

// POST /api/auth/login — generic failure message (no user enumeration).
router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return res.status(400).json({ error: "username and password are required" });
  }
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });

  try {
    const user = await User.findOne({ username: username.trim().toLowerCase() });
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: "Invalid username or password" });

    await startLoggedInSession(req, user._id.toString());
    res.json({ user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error("[auth] login failed:", err);
    res.status(500).json({ error: "login failed" });
  }
});

// POST /api/auth/logout — destroy the session.
router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(COOKIE).json({ ok: true });
  });
});

// GET /api/auth/me — current user or 401.
router.get("/me", requireAuth, async (req, res) => {
  if (!DB_UP()) return res.status(503).json({ error: "database unavailable" });
  try {
    const user = await User.findById(req.session.userId).select("username").lean();
    if (!user) return res.status(401).json({ error: "Not logged in" });
    res.json({ user: { id: user._id, username: user.username } });
  } catch (err) {
    console.error("[auth] me failed:", err);
    res.status(500).json({ error: "lookup failed" });
  }
});

export default router;
