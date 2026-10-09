import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import multer from "multer";
import Donation from "../models/Donation.js";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

// Proofs of payment are stored privately on disk and only served through an authenticated route
const proofDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads", "proofs");
fs.mkdirSync(proofDir, { recursive: true });

const PROOF_TYPES = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };
const upload = multer({
  storage: multer.diskStorage({
    destination: proofDir,
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${PROOF_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (PROOF_TYPES[file.mimetype]) return cb(null, true);
    const error = new Error("Proof must be a JPG, PNG, WebP or PDF file");
    error.statusCode = 400;
    cb(error);
  },
});

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });
const norm = (value) => String(value ?? "").trim().toLowerCase();

// Same rule as the Match page: items go to drives that request them. Money can support any drive;
// clothing has no drive category of its own, so it goes to household/emergency relief.
function driveAccepts(drive, type) {
  if (type === "Money") return true;
  if (type === "Clothing") return ["household", "emergency"].includes(norm(drive.category)) || drive.urgent;
  return norm(drive.category) === norm(type);
}

const view = (d) => {
  const { proofFile, ...x } = d.toObject ? d.toObject() : d;
  return { ...x, hasProof: Boolean(proofFile), drive: d.driveId?.title ?? x.drive ?? "Unknown drive", donorName: d.donor?.name ?? x.donorName };
};

async function changeStatus(d, status, userId) {
  // Items: Pending → Approved → Dropped off → Received. Money is paid by QR, so it skips "Dropped off".
  const isMoney = d.type === "Money";
  const transitions = {
    Pending: ["Approved", "Rejected"],
    Approved: isMoney ? ["Received", "Rejected"] : ["Dropped off", "Rejected"],
    "Dropped off": ["Received", "Rejected"],
    Received: [],
    Rejected: [],
  };
  if (!transitions[d.status]?.includes(status)) {
    const error = new Error(`Invalid status transition from ${d.status} to ${status}`);
    error.statusCode = 400; throw error;
  }
  const previous = d.status;
  d.status = status;
  d.statusHistory.push({ status, changedBy: userId });
  if (status === "Received") d.receivedAt = new Date();
  await d.save();
  // A donation counts toward the drive's progress once approved (not again when received)
  if (status === "Approved") await Drive.findByIdAndUpdate(d.driveId, { $inc: { raised: d.quantity } });
  if (status === "Rejected" && ["Approved", "Dropped off"].includes(previous)) await Drive.findByIdAndUpdate(d.driveId, { $inc: { raised: -d.quantity } });
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

router.get("/:code/proof", async (req, res) => {
  const filter = req.user.role === "admin" ? { code: req.params.code } : { code: req.params.code, donor: req.user.id };
  const d = await Donation.findOne(filter);
  if (!d?.proofFile) return res.status(404).json({ message: "No proof of donation on file" });
  res.set("X-Content-Type-Options", "nosniff");
  res.sendFile(path.join(proofDir, path.basename(d.proofFile)));
});

router.get("/:code", async (req, res) => {
  const filter = req.user.role === "admin" ? { code: req.params.code } : { code: req.params.code, donor: req.user.id };
  const d = await Donation.findOne(filter).populate("driveId", "title");
  if (!d) return res.status(404).json({ message: "Donation not found" });
  res.json(view(d));
});

router.post("/", upload.single("proof"), async (req, res) => {
  const discardUpload = () => (req.file ? fs.promises.unlink(req.file.path).catch(() => {}) : undefined);
  try {
    // Only accept known fields; status, code and donor are set by the server
    const { driveId, type, quantity, method, details, contactNumber } = req.body;
    if (!mongoose.isValidObjectId(driveId)) throw badRequest("Select a valid donation drive");
    const drive = await Drive.findById(driveId);
    if (!drive) throw badRequest("That donation drive no longer exists");
    if (["Completed", "Archived"].includes(drive.status)) throw badRequest("This drive is no longer accepting donations");
    if (drive.raised >= drive.goal) throw badRequest("This drive has already reached its goal");
    if (!driveAccepts(drive, type)) throw badRequest(`This drive does not accept ${String(type).toLowerCase()} donations`);
    if (type === "Money" && !req.file) throw badRequest("Proof of donation is required for monetary donations");

    const last = await Donation.findOne().sort({ createdAt: -1 });
    const previous = last?.code ? Number(last.code.split("-")[2]) : 0;
    const code = `DON-${new Date().getFullYear()}-${String(previous + 1).padStart(5, "0")}`;
    const donation = await Donation.create({
      driveId, type, quantity, method: method || "dropoff", details, contactNumber,
      code, donor: req.user.id,
      proofFile: type === "Money" ? req.file?.filename : undefined,
      statusHistory: [{ status: "Pending", changedBy: req.user.id }],
    });
    if (type !== "Money") await discardUpload();
    res.status(201).json(view(donation));
  } catch (error) {
    await discardUpload();
    throw error;
  }
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
