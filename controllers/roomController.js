import crypto from "crypto";
import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";
import Task from "../models/Task.js";
import TaskActivity from "../models/TaskActivity.js";

const ROOM_CODE_LENGTH = 6;
const ROLE_ORDER = ["boss", "rider", "watcher"];

const getRoleLabel = (role) => {
  if (role === "boss") return "Flow Boss";
  if (role === "rider") return "Flow Rider";
  return "Flow Watcher";
};

const generateRoomCode = () =>
  crypto
    .randomBytes(ROOM_CODE_LENGTH)
    .toString("hex")
    .slice(0, ROOM_CODE_LENGTH)
    .toUpperCase();

const getJoinPath = (roomCode) => `/join/${roomCode}`;

const getAbsoluteJoinUrl = (req, roomCode) =>
  `${req.protocol}://${req.get("host")}${getJoinPath(roomCode)}`;

const buildMemberPayload = (member) => ({
  id: member._id,
  role: member.role,
  roleLabel: getRoleLabel(member.role),
  joinedAt: member.joinedAt,
  user: {
    id: member.user?._id,
    email: member.user?.email,
  },
});

const refreshRoomOwner = async (room) => {
  const bossMember = await RoomMember.findOne({ room: room._id, role: "boss" });

  if (bossMember) {
    room.owner = bossMember.user;
    await room.save();
  }
};

const emitRoomSync = (req, payload) => {
  const io = req.app.get("io");

  if (!io || !req.room?.roomCode) {
    return;
  }

  io.to(req.room.roomCode).emit("room:crew-changed", {
    roomCode: req.room.roomCode,
    ...payload,
  });
};

const createUniqueRoomCode = async () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const roomCode = generateRoomCode();
    const existingRoom = await Room.findOne({ roomCode });

    if (!existingRoom) {
      return roomCode;
    }
  }

  throw new Error("Unable to generate a unique room code");
};

export const createRoom = async (req, res) => {
  try {
    const roomName = String(req.body.name || req.body.roomName || "").trim();

    if (!roomName) {
      return res.status(400).json({ error: "Room name is required" });
    }

    const existingRoom = await Room.findOne({ owner: req.userId });

    if (existingRoom) {
      await RoomMember.findOneAndUpdate(
        { room: existingRoom._id, user: req.userId },
        {
          $set: { role: "boss" },
          $setOnInsert: {
            room: existingRoom._id,
            user: req.userId,
            role: "boss",
          },
        },
        { upsert: true, new: true },
      );

      return res.status(200).json({
        message: "Room already exists",
        existing: true,
        room: existingRoom,
        invitePath: getJoinPath(existingRoom.roomCode),
        inviteUrl: getAbsoluteJoinUrl(req, existingRoom.roomCode),
      });
    }

    const roomCode = await createUniqueRoomCode();

    const room = await Room.create({
      name: roomName,
      roomCode,
      createdBy: req.userId,
      owner: req.userId,
    });

    await RoomMember.create({
      room: room._id,
      user: req.userId,
      role: "boss",
    });

    return res.status(201).json({
      message: "Room created successfully",
      existing: false,
      room,
      invitePath: getJoinPath(room.roomCode),
      inviteUrl: getAbsoluteJoinUrl(req, room.roomCode),
    });
  } catch (error) {
    console.error("Create room error:", error);
    return res.status(500).json({ error: "Failed to create room" });
  }
};

export const joinRoom = async (req, res) => {
  try {
    const roomCode = String(req.params.roomCode || "")
      .trim()
      .toUpperCase();

    if (!roomCode) {
      return res.status(400).json({ error: "Room code is required" });
    }

    if (!req.session?.userId) {
      return res.redirect(
        `/login?redirectTo=${encodeURIComponent(getJoinPath(roomCode))}`,
      );
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    await RoomMember.findOneAndUpdate(
      { room: room._id, user: req.session.userId },
      {
        $setOnInsert: {
          room: room._id,
          user: req.session.userId,
          role: "watcher",
        },
      },
      { upsert: true, new: true },
    );

    return res.redirect(`/rooms/${room.roomCode}`);
  } catch (error) {
    console.error("Join room error:", error);
    return res.status(500).json({ error: "Failed to join room" });
  }
};

export const renderRoom = async (req, res) => {
  return res.render("index", {
    room: req.room,
    roomRole: req.roomRole,
    invitePath: getJoinPath(req.room.roomCode),
    inviteUrl: getAbsoluteJoinUrl(req, req.room.roomCode),
  });
};

export const getRoomDetails = async (req, res) => {
  try {
    const members = await RoomMember.find({ room: req.room._id })
      .populate("user", "email")
      .sort({ joinedAt: 1 });

    const memberPayload = members
      .map(buildMemberPayload)
      .sort((left, right) => {
        const leftRank = ROLE_ORDER.indexOf(left.role);
        const rightRank = ROLE_ORDER.indexOf(right.role);

        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }

        return new Date(left.joinedAt) - new Date(right.joinedAt);
      });

    return res.status(200).json({
      room: {
        id: req.room._id,
        name: req.room.name,
        roomCode: req.room.roomCode,
        createdAt: req.room.createdAt,
        invitePath: getJoinPath(req.room.roomCode),
        inviteUrl: getAbsoluteJoinUrl(req, req.room.roomCode),
      },
      currentMember: {
        role: req.roomRole,
        roleLabel: getRoleLabel(req.roomRole),
      },
      members: memberPayload,
    });
  } catch (error) {
    console.error("Get room details error:", error);
    return res.status(500).json({ error: "Failed to load room" });
  }
};

export const updateCrewRoles = async (req, res) => {
  try {
    const updates = Array.isArray(req.body.members) ? req.body.members : [];

    if (req.roomRole !== "boss") {
      return res
        .status(403)
        .json({ error: "Only the Flow Boss can update crew roles" });
    }

    if (updates.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one crew update is required" });
    }

    const allowedRoles = new Set(["rider", "watcher"]);

    for (const update of updates) {
      const memberId = String(update.memberId || update.id || "").trim();
      const nextRole = String(update.role || "")
        .trim()
        .toLowerCase();

      if (!memberId || !allowedRoles.has(nextRole)) {
        return res.status(400).json({ error: "Invalid crew update payload" });
      }

      const member = await RoomMember.findById(memberId);

      if (!member || member.room.toString() !== req.room._id.toString()) {
        return res.status(404).json({ error: "Crew member not found" });
      }

      if (member.role === "boss") {
        return res
          .status(400)
          .json({ error: "Use handover to change the Flow Boss" });
      }

      member.role = nextRole;
      await member.save();
    }

    const updatedMembers = await RoomMember.find({ room: req.room._id })
      .populate("user", "email")
      .sort({ joinedAt: 1 });

    emitRoomSync(req, {
      action: "roles-updated",
    });

    return res.status(200).json({
      message: "Crew roles updated",
      members: updatedMembers.map(buildMemberPayload),
    });
  } catch (error) {
    console.error("Update crew roles error:", error);
    return res.status(500).json({ error: "Failed to update crew roles" });
  }
};

export const removeCrewMember = async (req, res) => {
  try {
    if (req.roomRole !== "boss") {
      return res
        .status(403)
        .json({ error: "Only the Flow Boss can remove members" });
    }

    const member = await RoomMember.findById(req.params.memberId);

    if (!member || member.room.toString() !== req.room._id.toString()) {
      return res.status(404).json({ error: "Crew member not found" });
    }

    if (member.role === "boss") {
      return res
        .status(400)
        .json({ error: "Use handover before removing the Flow Boss" });
    }

    await RoomMember.deleteOne({ _id: member._id });

    const updatedMembers = await RoomMember.find({ room: req.room._id })
      .populate("user", "email")
      .sort({ joinedAt: 1 });

    emitRoomSync(req, {
      action: "member-removed",
    });

    return res.status(200).json({
      message: "Crew member removed",
      members: updatedMembers.map(buildMemberPayload),
    });
  } catch (error) {
    console.error("Remove crew member error:", error);
    return res.status(500).json({ error: "Failed to remove crew member" });
  }
};

export const handoverCrewRole = async (req, res) => {
  try {
    if (req.roomRole !== "boss") {
      return res
        .status(403)
        .json({ error: "Only the Flow Boss can hand over ownership" });
    }

    const nextBossId = String(req.body.memberId || "").trim();

    if (!nextBossId) {
      return res.status(400).json({ error: "A target member is required" });
    }

    const nextBoss = await RoomMember.findById(nextBossId);

    if (!nextBoss || nextBoss.room.toString() !== req.room._id.toString()) {
      return res.status(404).json({ error: "Crew member not found" });
    }

    if (nextBoss.role === "boss") {
      return res
        .status(400)
        .json({ error: "This member is already the Flow Boss" });
    }

    const currentBoss = await RoomMember.findOne({
      room: req.room._id,
      role: "boss",
    });

    if (!currentBoss) {
      return res.status(500).json({ error: "Current Flow Boss not found" });
    }

    currentBoss.role = "rider";
    nextBoss.role = "boss";

    await currentBoss.save();
    await nextBoss.save();
    await refreshRoomOwner(req.room);

    const updatedMembers = await RoomMember.find({ room: req.room._id })
      .populate("user", "email")
      .sort({ joinedAt: 1 });

    emitRoomSync(req, {
      action: "handover-complete",
    });

    return res.status(200).json({
      message: "Flow Boss handover complete",
      room: {
        id: req.room._id,
        name: req.room.name,
        roomCode: req.room.roomCode,
      },
      members: updatedMembers.map(buildMemberPayload),
    });
  } catch (error) {
    console.error("Handover crew role error:", error);
    return res.status(500).json({ error: "Failed to transfer ownership" });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    if (req.roomRole !== "boss") {
      return res
        .status(403)
        .json({ error: "Only the Flow Boss can delete rooms" });
    }

    const roomId = req.room._id;
    const roomCode = req.room.roomCode;
    const io = req.app.get("io");

    await TaskActivity.deleteMany({ room: roomId });
    await Task.deleteMany({ room: roomId });
    await RoomMember.deleteMany({ room: roomId });
    await Room.deleteOne({ _id: roomId });

    if (io) {
      io.to(roomCode).emit("room:deleted", {
        roomCode,
        message: "Flow Boss deleted this room.",
      });
    }

    return res.status(200).json({
      message: "Room deleted successfully",
      roomCode,
    });
  } catch (error) {
    console.error("Delete room error:", error);
    return res.status(500).json({ error: "Failed to delete room" });
  }
};
