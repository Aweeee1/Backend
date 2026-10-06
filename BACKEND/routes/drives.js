import { Router } from "express";
import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

// GET /api/drives?category=Food&q=flood   (public)
router.get("/", async (req, res) => {
  const filter = {};
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) filter.title = { $regex: req.query.q, $options: "i" };
  res.json(await Drive.find(filter).sort({ createdAt: -1 }));
});

// GET /api/drives/:id   (public)
router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(404).json({ message: "Drive not found" });
  const drive = await Drive.findById(req.params.id);
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(drive);
});

// POST /api/drives   (collectors only)
router.post("/", requireAuth, requireRole("collector"), async (req, res) => {
  const drive = await Drive.create({
    ...req.body,
    owner: req.user.id,
    organization: req.user.organization || req.body.organization,
  });
  res.status(201).json(drive);
});

// PATCH /api/drives/:id   (the collector who owns it)
router.patch("/:id", requireAuth, requireRole("collector"), async (req, res) => {
  const drive = await Drive.findOneAndUpdate(
    { _id: req.params.id, owner: req.user.id },
    req.body,
    { new: true, runValidators: true }
  );
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.json(drive);
});

// DELETE /api/drives/:id   (the collector who owns it)
router.delete("/:id", requireAuth, requireRole("collector"), async (req, res) => {
  const drive = await Drive.findOneAndDelete({ _id: req.params.id, owner: req.user.id });
  if (!drive) return res.status(404).json({ message: "Drive not found" });
  res.status(204).end();
});

export default router;
