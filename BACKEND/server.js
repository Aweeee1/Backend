import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRouter from "./routes/auth.js";
import drivesRouter from "./routes/drives.js";
import donationsRouter from "./routes/donations.js";
import usersRouter from "./routes/users.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { notFound } from "./middleware/notFound.js";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));
app.use(requestLogger);

app.get("/", (_req, res) => res.json({ name: "DAMAYAN API", version: "2.0", status: "running" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/drives", drivesRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/users", usersRouter);

app.use(notFound);
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message });
  if (err.name === "ValidationError" || err.name === "CastError") return res.status(400).json({ message: err.message });
  if (err.code === 11000) return res.status(400).json({ message: "A record with that unique value already exists" });
  // In development, include the real cause so it is visible in the browser; hidden in production
  const detail = process.env.NODE_ENV === "production" ? undefined : `${err.name}: ${err.message}`;
  res.status(500).json({ message: "Internal server error", detail });
});

await connectDB();
app.listen(PORT, () => console.log(`DAMAYAN API 2.0 running on http://localhost:${PORT}`));