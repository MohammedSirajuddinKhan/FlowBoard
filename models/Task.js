import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    column: {
      type: String,
      enum: ["todo", "progress", "done"],
      default: "todo",
    },
    order: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByRole: {
      type: String,
      enum: ["boss", "rider", "watcher", "personal"],
      default: "personal",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

// Index for faster queries
taskSchema.index({ userId: 1, column: 1 });
taskSchema.index({ room: 1, column: 1, order: 1 });
taskSchema.index({ room: 1, createdAt: -1 });

export default mongoose.model("Task", taskSchema);
