import mongoose from "mongoose";

const donationSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    driveId: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true },
    donor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true, enum: ["Money", "Food", "Clothing", "Education", "Medical", "Household", "Hygiene"] },
    quantity: { type: Number, required: true, min: 1 },
    method: { type: String, enum: ["pickup", "dropoff", "center"], required: true },
    details: { type: String, required: true, minlength: 10, maxlength: 2000 },
    contactNumber: { type: String, required: true, match: /^(\+63|0)9\d{9}$/ },
    status: { type: String, enum: ["Pending", "Approved", "Received", "Rejected"], default: "Pending" },
    statusHistory: [{
      status: { type: String, enum: ["Pending", "Approved", "Received", "Rejected"] },
      changedAt: { type: Date, default: Date.now },
      changedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
    }],
    receivedAt: Date,
  },
  { timestamps: true }
);

export default mongoose.model("Donation", donationSchema);
