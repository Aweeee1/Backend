import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true }, // e.g. DON-2026-00001
    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["pickup", "dropoff", "center"], required: true },
    details: { type: String, required: true, minlength: 10 },
    contactNumber: { type: String, required: true, match: /^(\+63|0)9\d{9}$/ },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Received", "Rejected"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

export default mongoose.model("Donation", donationSchema);
