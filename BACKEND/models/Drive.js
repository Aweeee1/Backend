
import mongoose from "mongoose";

const driveSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
    },
    organization: {
      type: String,
      default: "Independent Collector",
    },
    location: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
    },
    raised: {
      type: Number,
      default: 0,
      min: 0,
    },
    goal: {
      type: Number,
      required: true,
      min: 1,
    },
    urgent: {
      type: Boolean,
      default: false,
    },
    remaining: {
      type: String,
      default: "",
    },
    deadline: Date,
    description: String,
    status: {
      type: String,
      enum: ["Pending", "Active", "Completed", "Archived", "Rejected"],
      default: "Active",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret._id;
      },
    },
  }
);

driveSchema.virtual("daysRemaining").get(function () {
  if (!this.deadline) return null;

  return Math.ceil(
    (new Date(this.deadline).getTime() - Date.now()) / 86400000
  );
});

driveSchema.virtual("progressPercent").get(function () {
  return this.goal > 0
    ? Math.round((this.raised / this.goal) * 100)
    : 0;
});

export default mongoose.model("Drive", driveSchema);