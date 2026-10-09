
import "dotenv/config";
import express from "express";
import cors from "cors";

import { connectDB } from "./config/db.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import drivesRouter from "./routes/drives.js";
import donationsRouter from "./routes/donations.js";

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
}));

app.use(express.json());

app.get("/", (_req, res) => {
  res.send("DAMAYAN API is running. Try /api/drives");
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/drives", drivesRouter);
app.use("/api/donations", donationsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);

  const status =
    err.name === "ValidationError" || err.name === "CastError"
      ? 400
      : 500;

  res.status(status).json({
    message: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 5000;

try {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`DAMAYAN API running on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error("Failed to start DAMAYAN API:", error);
  process.exit(1);
}