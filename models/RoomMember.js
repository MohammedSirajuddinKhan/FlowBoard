import mongoose from "mongoose";

const roomMemberSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Room",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["boss", "rider", "watcher"],
      default: "watcher",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

roomMemberSchema.index({ room: 1, user: 1 }, { unique: true });
roomMemberSchema.index({ room: 1, role: 1 });

export default mongoose.model("RoomMember", roomMemberSchema);
