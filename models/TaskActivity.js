import mongoose from "mongoose";

const taskActivitySchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
      index: true,
    },
    taskTitleSnapshot: {
      type: String,
      required: true,
      trim: true,
    },
    action: {
      type: String,
      enum: ["created", "edited", "deleted", "moved"],
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    fromColumn: {
      type: String,
      default: null,
    },
    toColumn: {
      type: String,
      default: null,
    },
    details: {
      type: String,
      default: "",
      trim: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    performedByRole: {
      type: String,
      enum: ["boss", "rider", "watcher", "personal"],
      default: "personal",
    },
  },
  { timestamps: true },
);

taskActivitySchema.index({ room: 1, task: 1, createdAt: -1 });

export default mongoose.model("TaskActivity", taskActivitySchema);
