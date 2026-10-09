
import { Router } from "express";
import Donation from "../models/Donation.js";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function donationView(d) {
  return {
    id: d.code,
    code: d.code,
    drive: d.driveId?.title ?? "Unknown drive",
    donorName: d.donor?.name ?? "",
    type: d.type,
    quantity: d.quantity,
    method: d.method,
    status: d.status,
    createdAt: d.createdAt,
    hasProof: false,
  };
}

// GET /api/donations/admin/stats
router.get("/admin/stats", requireRole("admin"), async (_req, res) => {
  const items = await Donation.find();

  res.json({
    total: items.length,
    pending: items.filter((d) => d.status === "Pending").length,
    approved: items.filter((d) => d.status === "Approved").length,
    received: items.filter((d) => d.status === "Received").length,
    rejected: items.filter((d) => d.status === "Rejected").length,
    quantity: items
      .filter((d) => d.status === "Received")
      .reduce((sum, d) => sum + d.quantity, 0),
  });
});

// GET /api/donations/admin/all
router.get("/admin/all", requireRole("admin"), async (req, res) => {
  const filter = req.query.status
    ? { status: req.query.status }
    : {};

  const items = await Donation.find(filter)
    .sort({ createdAt: -1 })
    .populate("driveId", "title")
    .populate("donor", "name");

  res.json(items.map(donationView));
});

// GET /api/donations
router.get("/", async (req, res) => {
  const items = await Donation.find({ donor: req.user._id })
    .sort({ createdAt: -1 })
    .populate("driveId", "title");

  res.json(items.map(donationView));
});

// POST /api/donations
router.post("/", async (req, res) => {
  const {
    driveId,
    type,
    quantity,
    method,
    details,
    contactNumber,
  } = req.body;

  const last = await Donation.findOne().sort({ createdAt: -1 });
  const previous = last?.code?.match(/DON-\d+-(\d+)/)?.[1];

  const code = `DON-${new Date().getFullYear()}-${String(
    previous ? Number(previous) + 1 : 1
  ).padStart(5, "0")}`;

  const donation = await Donation.create({
    driveId,
    type,
    quantity,
    method,
    details,
    contactNumber,
    code,
    donor: req.user._id,
  });

  res.status(201).json(donation);
});

// PATCH /api/donations/:code/status
router.patch("/:code/status", async (req, res) => {
  if (!["admin", "collector"].includes(req.user.role)) {
    return res.status(403).json({
      message: "You do not have permission to update donations",
    });
  }

  const allowed = [
    "Pending",
    "Approved",
    "Dropped off",
    "Received",
    "Rejected",
  ];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({
      message: "Invalid donation status",
    });
  }

  const donation = await Donation.findOne({ code: req.params.code });

  if (!donation) {
    return res.status(404).json({ message: "Donation not found" });
  }

  const wasReceived = donation.status === "Received";
  donation.status = req.body.status;

  await donation.save();

  // Adjust drive funding when a donation enters or leaves Received.
  if (!wasReceived && donation.status === "Received") {
    await Drive.findByIdAndUpdate(donation.driveId, {
      $inc: { raised: donation.quantity },
    });
  } else if (wasReceived && donation.status !== "Received") {
    await Drive.findByIdAndUpdate(donation.driveId, {
      $inc: { raised: -donation.quantity },
    });
  }

  res.json(donation);
});

// Proof uploads are not implemented in this backend.
router.get("/:code/proof", requireRole("admin"), (_req, res) => {
  res.status(404).json({
    message: "No proof of donation is stored for this record",
  });
});

// GET /api/donations/:code
router.get("/:code", async (req, res) => {
  const donation = await Donation.findOne({
    code: req.params.code,
    donor: req.user._id,
  }).populate("driveId", "title");

  if (!donation) {
    return res.status(404).json({ message: "Donation not found" });
  }

  res.json(donationView(donation));
});

// DELETE /api/donations/:code
router.delete("/:code", async (req, res) => {
  const donation = await Donation.findOneAndDelete({
    code: req.params.code,
    donor: req.user._id,
    status: "Pending",
  });

  if (!donation) {
    return res.status(404).json({
      message: "Only your pending donations can be deleted",
    });
  }

  res.status(204).end();
});

export default router;