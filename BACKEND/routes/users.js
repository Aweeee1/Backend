
import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// All user-management endpoints are admin-only.
router.use(requireAuth, requireRole("admin"));

function safeUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    organization: user.organization || "",
    active: user.active !== false,
    verified: Boolean(user.verified),
    createdAt: user.createdAt,
  };
}

// GET /api/users/stats
router.get("/stats", async (_req, res) => {
  const [total, active, roles] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ active: { $ne: false } }),
    User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  res.json({
    total,
    active,
    byRole: Object.fromEntries(
      roles.map((item) => [item._id, item.count])
    ),
  });
});

// GET /api/users?q=search
router.get("/", async (req, res) => {
  const filter = {};

  if (req.query.q) {
    const q = String(req.query.q).slice(0, 100);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.$or = ["name", "email", "organization"].map((field) => ({
      [field]: { $regex: escaped, $options: "i" },
    }));
  }

  const users = await User.find(filter)
    .sort({ createdAt: -1 })
    .limit(500);

  res.json(users.map(safeUser));
});

// PATCH /api/users/:id
router.patch("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "User not found" });
  }

  const patch = {};

  for (const key of ["active", "verified"]) {
    if (typeof req.body[key] === "boolean") {
      patch[key] = req.body[key];
    }
  }

  if (["donor", "collector", "admin"].includes(req.body.role)) {
    patch.role = req.body.role;
  }

  if (typeof req.body.organization === "string") {
    patch.organization = req.body.organization;
  }

  // Do not allow an admin to disable their own account.
  if (
    String(req.user._id) === req.params.id &&
    patch.active === false
  ) {
    return res.status(400).json({
      message: "You cannot disable your own admin account",
    });
  }

  const user = await User.findByIdAndUpdate(
    req.params.id,
    patch,
    { new: true, runValidators: true }
  );

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json(safeUser(user));
});

// DELETE /api/users/:id
router.delete("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "User not found" });
  }

  if (String(req.user._id) === req.params.id) {
    return res.status(400).json({
      message: "You cannot delete your own admin account",
    });
  }

  const user = await User.findByIdAndDelete(req.params.id);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.status(204).end();
});

export default router;