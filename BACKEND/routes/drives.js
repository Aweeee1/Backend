import { Router } from "express";
import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import Donation from "../models/Donation.js";
import { requireAuth, requireRole, optionalAuth } from "../middleware/auth.js";

const router = Router();

const CATEGORIES = ["Emergency", "Food", "Education", "Medical", "Household", "Hygiene", "Essentials"];
const STATUSES = ["Pending", "Active", "Completed", "Archived", "Rejected"];

// Fields each role may write. Collectors can never set their own status, progress, or owner.
const COLLECTOR_FIELDS = ["title", "category", "location", "goal", "urgent", "remaining", "deadline", "description"];
const ADMIN_FIELDS = [...COLLECTOR_FIELDS, "organization", "raised", "status"];

const pick = (body, fields) => Object.fromEntries(fields.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));
const allowedFor = (role) => (role === "admin" ? ADMIN_FIELDS : COLLECTOR_FIELDS);

function validateEnums(data) {
  if (data.category !== undefined && !CATEGORIES.includes(data.category)) return "Invalid drive category";
  if (data.status !== undefined && !STATUSES.includes(data.status)) return "Invalid drive status";
  return null;
}

const decorate = (d) => {
  const raw = d.toObject ? d.toObject() : d;
  const percent = raw.goal > 0 ? Math.min(100, Math.round((raw.raised / raw.goal) * 100)) : 0;
  const daysRemaining = raw.deadline ? Math.max(0, Math.ceil((new Date(raw.deadline) - new Date()) / 86400000)) : null;
  return { ...raw, progressPercent: percent, daysRemaining, remainingAmount: Math.max(0, raw.goal - raw.raised) };
};

// Archived drives are hidden from everyone except admins
const isAdmin = (req) => req.user?.role === "admin";

router.get("/", optionalAuth, async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  if (!isAdmin(req)) filter.status = req.query.status === "Archived" ? "__none__" : (req.query.status || { $ne: "Archived" });
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

router.get("/search", optionalAuth, async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ message: "Search query is required" });
  const query = { $or: [{ title: { $regex: q, $options: "i" } }, { organization: { $regex: q, $options: "i" } }, { location: { $regex: q, $options: "i" } }] };
  if (!isAdmin(req)) query.status = { $ne: "Archived" };
  const drives = await Drive.find(query).limit(50);
  res.json(drives.map(decorate));
});

router.get("/owner/mine", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { owner: req.user.id };
  res.json((await Drive.find(filter).sort({ createdAt: -1 })).map(decorate));
});

router.get("/:id", optionalAuth, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Drive not found" });
  const drive = await Drive.findById(req.params.id).populate("owner", "name organization");
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  const ownerId = String(drive.owner?._id ?? drive.owner ?? "");
  if (drive.status === "Archived" && !isAdmin(req) && ownerId !== String(req.user?.id ?? "")) return res.status(404).json({ message: "Drive not found" });
  res.json(decorate(drive));
});

router.post("/", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const data = pick(req.body, allowedFor(req.user.role));
  const enumError = validateEnums(data);
  if (enumError) return res.status(400).json({ message: enumError });

  // Collector drives wait for review; drives created by an admin go live unless the admin says otherwise
  const drive = await Drive.create({
    ...data,
    owner: req.user.id,
    organization: isAdmin ? (data.organization?.trim() || req.user.organization || "DAMAYAN") : (req.user.organization || data.organization),
    status: isAdmin ? (data.status || "Active") : "Pending",
  });
  res.status(201).json(decorate(drive));
});

router.patch("/:id", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Drive not found" });
  const data = pick(req.body, allowedFor(req.user.role));
  const enumError = validateEnums(data);
  if (enumError) return res.status(400).json({ message: enumError });
  if (data.deadline === "") data.deadline = null;

  // Collectors may archive their own drive; any other status change is an admin decision
  if (req.user.role === "collector" && req.body.status === "Archived") data.status = "Archived";

  const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, owner: req.user.id };
  const drive = await Drive.findOneAndUpdate(filter, data, { new: true, runValidators: true });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(decorate(drive));
});

router.delete("/:id", requireAuth, requireRole("collector", "admin"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Drive not found" });
  const filter = req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, owner: req.user.id };
  const drive = await Drive.findOne(filter);
  if (!drive) return res.status(404).json({ message: "Drive not found" });

  // Donation records point at the drive, so deleting it would orphan them. Archive instead.
  const donations = await Donation.countDocuments({ driveId: drive._id });
  if (donations > 0) {
    return res.status(409).json({ message: `This drive has ${donations} donation${donations === 1 ? "" : "s"} and can't be deleted. Archive it instead.` });
  }
  await drive.deleteOne();
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
