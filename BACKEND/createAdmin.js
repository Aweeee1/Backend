// Creates or repairs an admin account WITHOUT touching any other data.
// (Unlike seed.js, which deletes all users, drives and donations.)
//
// Place this file in Backend-main/BACKEND/ next to seed.js, then run:
//   node createAdmin.js
//   node createAdmin.js you@example.com "YourNewPassword1!"
//
// If the email already exists, that user is promoted to admin, re-enabled,
// verified, and given the new password.

import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";

const email = String(process.argv[2] ?? "admin@damayan.test").toLowerCase().trim();
const password = String(process.argv[3] ?? "Admin123!");

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing. Create BACKEND/.env first (see .env.example).");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);
console.log(`Connected to database: ${mongoose.connection.name}`);

const passwordHash = await bcrypt.hash(password, 10);
const existing = await User.findOne({ email });

if (existing) {
  existing.passwordHash = passwordHash;
  existing.role = "admin";
  existing.active = true;
  existing.verified = true;
  await existing.save();
  console.log(`Updated existing user -> admin: ${email}`);
} else {
  await User.create({
    name: "DAMAYAN Administrator",
    email,
    passwordHash,
    role: "admin",
    organization: "DAMAYAN",
    active: true,
    verified: true,
  });
  console.log(`Created new admin: ${email}`);
}

console.log(`Login with: ${email} / ${password}`);
await mongoose.disconnect();
