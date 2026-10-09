import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./models/User.js";
import Drive from "./models/Drive.js";
import Donation from "./models/Donation.js";

await mongoose.connect(process.env.MONGO_URI);

await Promise.all([User.deleteMany({}), Drive.deleteMany({}), Donation.deleteMany({})]);

const admin = await User.create({
  name: "DAMAYAN Administrator",
  email: "admin@damayan.test",
  passwordHash: await bcrypt.hash("Admin123!", 10),
  role: "admin",
  organization: "DAMAYAN",
  active: true,
  verified: true,
});

const collector = await User.create({
  name: "Community Table PH",
  email: "collector@damayan.test",
  passwordHash: await bcrypt.hash("Collector123!", 10),
  role: "collector",
  organization: "Community Table PH",
  active: true,
  verified: true,
});

const donor = await User.create({
  name: "Demo Donor",
  email: "donor@damayan.test",
  passwordHash: await bcrypt.hash("Donor123!", 10),
  role: "donor",
  active: true,
  verified: true,
});

const drives = await Drive.insertMany([
  { title: "Flood Relief for 200 Families", organization: "Community Table PH", location: "Marikina City", category: "Emergency", raised: 72000, goal: 100000, urgent: true, remaining: "Rice, water, canned goods, blankets", deadline: new Date(Date.now()+5*86400000), description: "Emergency food and essential supplies for families affected by flooding.", owner: collector._id, status: "Active" },
  { title: "Back-to-School Kits for Public Students", organization: "Open Door Learning", location: "Davao City", category: "Education", raised: 682, goal: 900, remaining: "218 school kits", deadline: new Date(Date.now()+20*86400000), description: "School supplies for public school students.", owner: collector._id, status: "Active" },
  { title: "Barangay First Aid Stations", organization: "Care Within Reach", location: "Cebu City", category: "Medical", raised: 318, goal: 500, remaining: "182 first-aid kits", deadline: new Date(Date.now()+30*86400000), description: "First-aid kits for barangay emergency stations.", owner: collector._id, status: "Active" },
  { title: "Meals for 500 Low-Income Families", organization: "Community Table", location: "Quezon City", category: "Food", raised: 184200, goal: 250000, remaining: "₱65,800", deadline: new Date(Date.now()+12*86400000), description: "Meal support for low-income families.", owner: collector._id, status: "Active" },
  { title: "Home Kits for Fire-Affected Families", organization: "Home Again Network", location: "Pasig City", category: "Household", raised: 84, goal: 140, remaining: "56 home kits", deadline: new Date(Date.now()+18*86400000), description: "Household essentials for families displaced by fire.", owner: collector._id, status: "Pending" },
]);

const d = await Donation.create({
  code: "DON-2026-00001",
  driveId: drives[0]._id,
  donor: donor._id,
  type: "Food",
  quantity: 10,
  method: "dropoff",
  details: "Ten boxes of shelf-stable food in good condition.",
  contactNumber: "+639171234567",
  status: "Pending",
  statusHistory: [{ status: "Pending", changedBy: donor._id }]
});

console.log("Seed complete");
console.log("Admin: admin@damayan.test / Admin123!");
console.log("Collector: collector@damayan.test / Collector123!");
console.log("Donor: donor@damayan.test / Donor123!");
await mongoose.disconnect();
