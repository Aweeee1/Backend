
import { Router } from "express";
import mongoose from "mongoose";
import Drive from "../models/Drive.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

const isAdmin = (req) => req.user?.role === "admin";

const canManage = (req, drive) =>
  isAdmin(req) ||
  (
    req.user?.role === "collector" &&
    String(drive.owner) === String(req.user._id)
  );

async function statsFor() {
  const drives = await Drive.find();

  const total = drives.length;
  const active = drives.filter((d) => d.status === "Active").length;
  const urgent = drives.filter(
    (d) => d.urgent && d.status === "Active"
  ).length;
  const completed = drives.filter(
    (d) => d.status === "Completed"
  ).length;
  const raised = drives.reduce(
    (sum, d) => sum + (Number(d.raised) || 0),
    0
  );
  const goal = drives.reduce(
    (sum, d) => sum + (Number(d.goal) || 0),
    0
  );

  return {
    total,
    active,
    urgent,
    completed,
    raised,
    goal,
    progressPercent: goal
      ? Math.round((raised / goal) * 100)
      : 0,
  };
}

// Keep these routes before /:id.
router.get(
  "/stats/overview",
  requireAuth,
  requireRole("admin"),
  async (_req, res) => {
    res.json(await statsFor());
  }
);

// GET /api/drives/owner/mine
router.get("/owner/mine", requireAuth, async (req, res) => {
  const filter = isAdmin(req) ? {} : { owner: req.user._id };

  const drives = await Drive.find(filter).sort({ createdAt: -1 });

  res.json(drives);
});

// GET /api/drives
router.get("/", async (req, res) => {
  const filter = {};

  if (req.query.category) {
    filter.category = req.query.category;
  }

  if (req.query.q) {
    const q = String(req.query.q).slice(0, 100);
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    filter.title = { $regex: escaped, $options: "i" };
  }

  res.json(await Drive.find(filter).sort({ createdAt: -1 }));
});

// POST /api/drives
router.post("/", requireAuth, async (req, res) => {
  if (!isAdmin(req) && req.user.role !== "collector") {
    return res.status(403).json({
      message: "You do not have permission to create drives",
    });
  }

  const {
    title,
    organization,
    location,
    category,
    raised,
    goal,
    urgent,
    remaining,
    deadline,
    description,
    status,
  } = req.body;

  const drive = await Drive.create({
    title,
    organization: isAdmin(req)
      ? organization
      : req.user.organization || organization,
    location,
    category,
    raised,
    goal,
    urgent,
    remaining,
    deadline: deadline || null,
    description,
    status: isAdmin(req) ? status : "Pending",
    owner: req.user._id,
  });

  res.status(201).json(drive);
});

// PATCH /api/drives/:id/status
router.patch(
  "/:id/status",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const allowed = [
      "Pending",
      "Active",
      "Completed",
      "Archived",
      "Rejected",
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        message: "Invalid drive status",
      });
    }

    const drive = await Drive.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );

    if (!drive) {
      return res.status(404).json({ message: "Drive not found" });
    }

    res.json(drive);
  }
);

// GET /api/drives/:id
router.get("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Drive not found" });
  }

  const drive = await Drive.findById(req.params.id);

  if (!drive) {
    return res.status(404).json({ message: "Drive not found" });
  }

  res.json(drive);
});

// PATCH /api/drives/:id
router.patch("/:id", requireAuth, async (req, res) => {
  const drive = await Drive.findById(req.params.id);

  if (!drive || !canManage(req, drive)) {
    return res.status(404).json({ message: "Drive not found" });
  }

  const allowed = [
    "title",
    "organization",
    "location",
    "category",
    "raised",
    "goal",
    "urgent",
    "remaining",
    "deadline",
    "description",
  ];

  if (isAdmin(req)) {
    allowed.push("status");
  }

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      drive[key] = req.body[key];
    }
  }

  await drive.save();
  res.json(drive);
});

// DELETE /api/drives/:id
router.delete("/:id", requireAuth, async (req, res) => {
  const drive = await Drive.findById(req.params.id);

  if (!drive || !canManage(req, drive)) {
    return res.status(404).json({ message: "Drive not found" });
  }

  await drive.deleteOne();
  res.status(204).end();
});

export default router;