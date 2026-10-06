import mongoose from "mongoose";

const driveSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 8 },
    organization: { type: String, default: "Independent Collector" },
    location: { type: String, default: "" },
    category: { type: String, required: true },
    raised: { type: Number, default: 0, min: 0 },
    goal: { type: Number, required: true, min: 1 },
    urgent: { type: Boolean, default: false },
    remaining: { type: String, default: "" },
    deadline: Date,
    description: String,
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true,
    // Your frontend uses `id`; MongoDB uses `_id`. This sends `id` and hides `_id`.
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
      },
    },
  }
);

export default mongoose.model("Drive", driveSchema);
