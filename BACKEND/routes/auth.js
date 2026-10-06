import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const sign = (user) => jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: "7d" });

// POST /api/auth/register
router.post("/register", async (req, res) => {
  const { name, email, password, role, organization } = req.body;

  if (!password || String(password).length < 8)
    return res.status(400).json({ message: "Password must be at least 8 characters" });

  const existing = await User.findOne({ email: String(email ?? "").toLowerCase() });
  if (existing) return res.status(409).json({ message: "An account with this email already exists" });

  const isCollector = role === "collector";
  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(String(password), 10),
    role: isCollector ? "collector" : "donor",
    organization: isCollector ? organization : "",
  });

  res.status(201).json({ token: sign(user), user });
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: String(email ?? "").toLowerCase() });
  const valid = user && (await bcrypt.compare(String(password ?? ""), user.passwordHash));

  // Same message for "no such email" and "wrong password" so attackers can't probe emails
  if (!valid) return res.status(401).json({ message: "Incorrect email or password" });

  res.json({ token: sign(user), user });
});

// GET /api/auth/me  (used to restore the session on page refresh)
router.get("/me", requireAuth, (req, res) => res.json(req.user));

export default router;
