import mongoose from "mongoose";

const driveSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 8, maxlength: 120 },
    organization: { type: String, default: "Independent Collector", trim: true },
    location: { type: String, default: "", trim: true },
    category: { type: String, required: true, enum: ["Emergency", "Food", "Education", "Medical", "Household", "Hygiene", "Essentials"] },
    raised: { type: Number, default: 0, min: 0 },
    goal: { type: Number, required: true, min: 1 },
    urgent: { type: Boolean, default: false },
    remaining: { type: String, default: "" },
    deadline: { type: Date },
    description: { type: String, default: "", maxlength: 2000 },
    status: { type: String, enum: ["Pending", "Active", "Completed", "Archived", "Rejected"], default: "Pending" },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => { delete ret._id; }
    }
  }
);

export default mongoose.model("Drive", driveSchema);
