import { Router } from "express";
import Donation from "../models/Donation.js";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const toView = (d) => ({
  id: d.code,
  drive: d.driveId?.title ?? "Unknown drive",
  type: d.type,
  method: d.method,
  status: d.status,
  date: d.createdAt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }),
});

// GET /api/donations   (the signed-in user's own donations)
router.get("/", async (req, res) => {
  const items = await Donation.find({ donor: req.user.id })
    .sort({ createdAt: -1 })
    .populate("driveId", "title");
  res.json(items.map(toView));
});

// GET /api/donations/:code
router.get("/:code", async (req, res) => {
  const d = await Donation.findOne({ code: req.params.code, donor: req.user.id }).populate(
    "driveId",
    "title"
  );
  if (!d) return res.status(404).json({ message: "Donation not found" });
  res.json(toView(d));
});

// POST /api/donations
router.post("/", async (req, res) => {
  const last = await Donation.findOne().sort({ createdAt: -1 });
  const next = last ? parseInt(last.code.split("-")[2], 10) + 1 : 1;
  const code = `DON-${new Date().getFullYear()}-${String(next).padStart(5, "0")}`;
  const donation = await Donation.create({ ...req.body, code, donor: req.user.id });
  res.status(201).json(donation);
});

// PATCH /api/donations/:code/status   (collectors only)   body: { "status": "Received" }
router.patch("/:code/status", requireRole("collector"), async (req, res) => {
  const d = await Donation.findOneAndUpdate(
    { code: req.params.code },
    { status: req.body.status },
    { new: true, runValidators: true }
  );
  if (!d) return res.status(404).json({ message: "Donation not found" });
  if (d.status === "Received") {
    await Drive.findByIdAndUpdate(d.driveId, { $inc: { raised: d.quantity } });
  }
  res.json(d);
});

// DELETE /api/donations/:code   (own, pending only)
router.delete("/:code", async (req, res) => {
  const d = await Donation.findOneAndDelete({
    code: req.params.code,
    donor: req.user.id,
    status: "Pending",
  });
  if (!d) return res.status(404).json({ message: "Only your pending donations can be deleted" });
  res.status(204).end();
});

export default router;
