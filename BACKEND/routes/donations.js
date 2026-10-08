import { Router } from "express";
import Donation from "../models/Donation.js";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

const view = (d) => {
  const x = d.toObject ? d.toObject() : d;
  return { ...x, drive: d.driveId?.title ?? x.drive ?? "Unknown drive", donorName: d.donor?.name ?? x.donorName };
};

async function changeStatus(d, status, userId) {
  const transitions = { Pending: ["Approved", "Rejected"], Approved: ["Received", "Rejected"], Received: [], Rejected: [] };
  if (!transitions[d.status]?.includes(status)) {
    const error = new Error(`Invalid status transition from ${d.status} to ${status}`);
    error.statusCode = 400; throw error;
  }
  d.status = status;
  d.statusHistory.push({ status, changedBy: userId });
  if (status === "Received") d.receivedAt = new Date();
  await d.save();
  if (status === "Received") await Drive.findByIdAndUpdate(d.driveId, { $inc: { raised: d.quantity } });
  return d;
}

router.get("/", async (req, res) => {
  const items = await Donation.find({ donor: req.user.id }).sort({ createdAt: -1 }).populate("driveId", "title");
  res.json(items.map(view));
});

router.get("/stats/mine", async (req, res) => {
  const [count, received, qty] = await Promise.all([
    Donation.countDocuments({ donor: req.user.id }),
    Donation.countDocuments({ donor: req.user.id, status: "Received" }),
    Donation.aggregate([{ $match: { donor: req.user._id } }, { $group: { _id: null, quantity: { $sum: "$quantity" } } }])
  ]);
  res.json({ count, received, quantity: qty[0]?.quantity || 0 });
});

router.get("/admin/all", requireRole("admin"), async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.type) filter.type = req.query.type;
  const items = await Donation.find(filter).sort({ createdAt: -1 }).populate("driveId", "title").populate("donor", "name email");
  res.json(items.map(view));
});

router.get("/admin/stats", requireRole("admin"), async (_req, res) => {
  const [total, pending, approved, received, rejected, aggregate] = await Promise.all([
    Donation.countDocuments(), Donation.countDocuments({ status: "Pending" }), Donation.countDocuments({ status: "Approved" }), Donation.countDocuments({ status: "Received" }), Donation.countDocuments({ status: "Rejected" }),
    Donation.aggregate([{ $group: { _id: null, quantity: { $sum: "$quantity" } } }])
  ]);
  res.json({ total, pending, approved, received, rejected, quantity: aggregate[0]?.quantity || 0 });
});

router.get("/admin/:code", requireRole("admin"), async (req, res) => {
  const d = await Donation.findOne({ code: req.params.code }).populate("driveId", "title").populate("donor", "name email");
  if (!d) return res.status(404).json({ message: "Donation not found" });
  res.json(view(d));
});

router.get("/:code", async (req, res) => {
  const filter = req.user.role === "admin" ? { code: req.params.code } : { code: req.params.code, donor: req.user.id };
  const d = await Donation.findOne(filter).populate("driveId", "title");
  if (!d) return res.status(404).json({ message: "Donation not found" });
  res.json(view(d));
});

router.post("/", async (req, res) => {
  const last = await Donation.findOne().sort({ createdAt: -1 });
  const previous = last?.code ? Number(last.code.split("-")[2]) : 0;
  const code = `DON-${new Date().getFullYear()}-${String(previous + 1).padStart(5, "0")}`;
  const donation = await Donation.create({ ...req.body, code, donor: req.user.id, statusHistory: [{ status: "Pending", changedBy: req.user.id }] });
  res.status(201).json(donation);
});

router.patch("/:code/status", requireRole("collector", "admin"), async (req, res) => {
  const d = await Donation.findOne({ code: req.params.code });
  if (!d) return res.status(404).json({ message: "Donation not found" });
  const updated = await changeStatus(d, req.body.status, req.user.id);
  res.json(view(updated));
});

router.delete("/:code", async (req, res) => {
  const d = await Donation.findOneAndDelete({ code: req.params.code, donor: req.user.id, status: "Pending" });
  if (!d) return res.status(404).json({ message: "Only your pending donations can be deleted" });
  res.status(204).end();
});

export default router;
