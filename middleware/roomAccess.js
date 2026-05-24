import Room from "../models/Room.js";
import RoomMember from "../models/RoomMember.js";

const ROLE_PRIORITY = {
  watcher: 0,
  rider: 1,
  boss: 2,
};

const normalizeRoomCode = (roomCode) =>
  String(roomCode || "")
    .trim()
    .toUpperCase();

export const requireRoomMembership = async (req, res, next) => {
  try {
    const roomCode = normalizeRoomCode(req.params.roomCode);

    if (!roomCode) {
      return res.status(400).json({ error: "Room code is required" });
    }

    const room = await Room.findOne({ roomCode });

    if (!room) {
      return res.status(404).json({ error: "Room not found" });
    }

    const membership = await RoomMember.findOne({
      room: room._id,
      user: req.userId,
    }).populate("user", "email");

    if (!membership) {
      return res
        .status(403)
        .json({ error: "You do not have access to this room" });
    }

    req.room = room;
    req.roomMembership = membership;
    req.roomRole = membership.role;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRoomRole = (...allowedRoles) => {
  const normalizedRoles = allowedRoles.map((role) =>
    String(role).toLowerCase(),
  );

  return (req, res, next) => {
    const membership = req.roomMembership;

    if (!membership) {
      return res.status(403).json({ error: "Room membership is required" });
    }

    if (!normalizedRoles.includes(membership.role)) {
      return res.status(403).json({ error: "Insufficient room permissions" });
    }

    next();
  };
};

export const hasRoomPermission = (membership, minimumRole) => {
  if (!membership) {
    return false;
  }

  return ROLE_PRIORITY[membership.role] >= ROLE_PRIORITY[minimumRole];
};

export { ROLE_PRIORITY, normalizeRoomCode };
