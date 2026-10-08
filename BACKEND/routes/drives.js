import { Router } from "express";
import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import Donation from "../models/Donation.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const decorate = (d) => {
  const raw = d.toObject ? d.toObject() : d;
  const percent = raw.goal > 0 ? Math.min(100, Math.round((raw.raised / raw.goal) * 100)) : 0;
  const daysRemaining = raw.deadline ? Math.max(0, Math.ceil((new Date(raw.deadline) - new Date()) / 86400000)) : null;
  return { ...raw, progressPercent: percent, daysRemaining, remainingAmount: Math.max(0, raw.goal - raw.raised) };
};

router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.urgent === "true") filter.urgent = true;
  if (req.query.q) filter.$or = [{ title: { $regex: req.query.q, $options: "i" } }, { organization: { $regex: req.query.q, $options: "i" } }, { location: { $regex: req.query.q, $options: "i" } }];
  const sort = req.query.sort === "goal" ? { goal: 1 } : req.query.sort === "urgent" ? { urgent: -1, createdAt: -1 } : { createdAt: -1 };
  res.json((await Drive.find(filter).sort(sort)).map(decorate));
});

router.get("/stats/overview", async (_req, res) => {
  const [total, active, urgent, completed, totals] = await Promise.all([
    Drive.countDocuments(), Drive.countDocuments({ status: "Active" }), Drive.countDocuments({ urgent: true, status: "Active" }), Drive.countDocuments({ status: "Completed" }),
    Drive.aggregate([{ $group: { _id: null, raised: { $sum: "$raised" }, goal: { $sum: "$goal" } } }])
  ]);
  const t = totals[0] || { raised: 0, goal: 0 };
  res.json({ total, active, urgent, completed, raised: t.raised, goal: t.goal, progressPercent: t.goal ? Math.round(t.raised / t.goal * 100) : 0 });
});

router.get("/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ message: "Search query is required" });
  const drives = await Drive.find({ $or: [{ title: { $regex: q, $options: "i" } }, { organization: { $regex: q, $options: "i" } }, { location: { $regex: q, $options: "i" } }] }).limit(50);
  res.json(drives.map(decorate));
});

router.get("/owner/mine", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { owner: req.user.id };
  res.json((await Drive.find(filter).sort({ createdAt: -1 })).map(decorate));
});

router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Drive not found" });
  const drive = await Drive.findById(req.params.id).populate("owner", "name organization");
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(decorate(drive));
});

router.post("/", requireAuth, requireRole("collector"), async (req, res) => {
  const drive = await Drive.create({ ...req.body, owner: req.user.id, organization: req.user.organization || req.body.organization, status: "Pending" });
  res.status(201).json(decorate(drive));
});

router.patch("/:id", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, owner: req.user.id };
  const drive = await Drive.findOneAndUpdate(filter, req.body, { new: true, runValidators: true });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(decorate(drive));
});

router.delete("/:id", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, owner: req.user.id };
  const drive = await Drive.findOneAndDelete(filter);
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.status(204).end();
});

router.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  const allowed = ["Pending", "Active", "Completed", "Archived", "Rejected"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid drive status" });
  const drive = await Drive.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(decorate(drive));
});

export default router;
