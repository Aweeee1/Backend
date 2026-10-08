import { Router } from "express";
import User from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireRole("admin"));

router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.active !== undefined) filter.active = req.query.active === "true";
  if (req.query.q) filter.$or = [{ name: { $regex: req.query.q, $options: "i" } }, { email: { $regex: req.query.q, $options: "i" } }, { organization: { $regex: req.query.q, $options: "i" } }];
  res.json(await User.find(filter).select("-passwordHash").sort({ createdAt: -1 }));
});

router.get("/stats", async (_req, res) => {
  const grouped = await User.aggregate([{ $group: { _id: "$role", count: { $sum: 1 } } }]);
  const total = await User.countDocuments();
  const active = await User.countDocuments({ active: true });
  res.json({ total, active, byRole: Object.fromEntries(grouped.map((x) => [x._id, x.count])) });
});

router.get("/:id", async (req, res) => {
  const user = await User.findById(req.params.id).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

router.patch("/:id", async (req, res) => {
  const allowed = ["role", "active", "verified", "organization"];
  const update = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

router.delete("/:id", async (req, res) => {
  if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ message: "You cannot delete your own admin account" });
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.status(204).end();
});

export default router;
