import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import authRouter from "./routes/auth.js";
import drivesRouter from "./routes/drives.js";
import donationsRouter from "./routes/donations.js";

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL }));
app.use(express.json());

app.get("/", (_req, res) => res.send("DAMAYAN API is running. Try /api/drives"));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/drives", drivesRouter);
app.use("/api/donations", donationsRouter);

// Your axios interceptor reads error.response.data.message, so always send { message }
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.name === "ValidationError" || err.name === "CastError" ? 400 : 500;
  res.status(status).json({ message: err.message });
});

await connectDB();
app.listen(process.env.PORT, () =>
  console.log(`API running on http://localhost:${process.env.PORT}`)
);
