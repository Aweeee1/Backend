import "dotenv/config";
import mongoose from "mongoose";
import Drive from "./models/Drive.js";

const drives = [
  { title: "Flood Relief for 200 Families", organization: "Community Table PH", location: "Marikina City", category: "Emergency", raised: 72000, goal: 100000, urgent: true, remaining: "Rice, water, canned goods, blankets" },
  { title: "Back-to-School Kits for Public Students", organization: "Open Door Learning", location: "Davao City", category: "Education", raised: 682, goal: 900, remaining: "218 school kits" },
  { title: "Barangay First Aid Stations", organization: "Care Within Reach", location: "Cebu City", category: "Medical", raised: 318, goal: 500, remaining: "182 first-aid kits" },
  { title: "Meals for 500 Low-Income Families", organization: "Community Table", location: "Quezon City", category: "Food", raised: 184200, goal: 250000, remaining: "₱65,800" },
  { title: "Home Kits for Fire-Affected Families", organization: "Home Again Network", location: "Pasig City", category: "Household", raised: 84, goal: 140, remaining: "56 home kits" },
  { title: "Dignity Kits for Women and Girls", organization: "Her Safe Place", location: "Marikina City", category: "Hygiene", raised: 445, goal: 700, remaining: "255 hygiene kits" },
];

await mongoose.connect(process.env.MONGODB_URI);
await Drive.deleteMany({});
await Drive.insertMany(drives);
console.log("Seeded", drives.length, "drives");
await mongoose.disconnect();
