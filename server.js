import http from "http";
import { Server } from "socket.io";
import app, { sessionMiddleware } from "./app.js";
import Room from "./models/Room.js";
import RoomMember from "./models/RoomMember.js";
import colors from "colors";
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

if (process.env.VERCEL !== "1") {
  server.listen(PORT, () => {
    console.log(
      `\FlowBoard server running on http://localhost:${PORT}`.bgGreen,
    );
    console.log(`Make sure MongoDB is running`.america);
  });
}

const io = new Server(server, {
  path: "/socket.io",
});

app.set("io", io);

const roomPresence = new Map();

const getPresenceEntry = (roomCode) => {
  if (!roomPresence.has(roomCode)) {
    roomPresence.set(roomCode, new Map());
  }

  return roomPresence.get(roomCode);
};

const emitPresence = (roomCode) => {
  const entry = roomPresence.get(roomCode);
  const onlineCount = entry ? entry.size : 0;

  io.to(roomCode).emit("room:presence", {
    roomCode,
    onlineCount,
  });
};

const joinRoomPresence = (socket, roomCode) => {
  const nextRoomCode = String(roomCode || "")
    .trim()
    .toUpperCase();

  if (!nextRoomCode || !socket.request.session?.userId) {
    return false;
  }

  const room = getPresenceEntry(nextRoomCode);
  const userId = String(socket.request.session.userId);
  const sockets = room.get(userId) || new Set();

  sockets.add(socket.id);
  room.set(userId, sockets);

  socket.data.roomCode = nextRoomCode;
  socket.data.userId = userId;
  socket.join(nextRoomCode);
  emitPresence(nextRoomCode);

  return true;
};

const leaveRoomPresence = (socket, roomCode = socket.data.roomCode) => {
  const nextRoomCode = String(roomCode || "")
    .trim()
    .toUpperCase();

  if (!nextRoomCode || !socket.data.userId) {
    return;
  }

  const room = roomPresence.get(nextRoomCode);
  if (!room) {
    return;
  }

  const sockets = room.get(socket.data.userId);
  if (sockets) {
    sockets.delete(socket.id);

    if (sockets.size === 0) {
      room.delete(socket.data.userId);
    } else {
      room.set(socket.data.userId, sockets);
    }
  }

  if (room.size === 0) {
    roomPresence.delete(nextRoomCode);
  }

  emitPresence(nextRoomCode);
};

io.use((socket, next) => sessionMiddleware(socket.request, {}, next));

io.on("connection", (socket) => {
  socket.on("room:join", async ({ roomCode }) => {
    try {
      if (socket.data.roomCode) {
        leaveRoomPresence(socket, socket.data.roomCode);
      }

      const nextRoomCode = String(roomCode || "")
        .trim()
        .toUpperCase();

      if (!nextRoomCode || !socket.request.session?.userId) {
        return;
      }

      const room = await Room.findOne({ roomCode: nextRoomCode });

      if (!room) {
        return;
      }

      const membership = await RoomMember.findOne({
        room: room._id,
        user: socket.request.session.userId,
      });

      if (!membership) {
        return;
      }

      joinRoomPresence(socket, nextRoomCode);
      socket.emit("room:joined", { roomCode: nextRoomCode });
    } catch (error) {
      console.error("Socket room join error:", error);
    }
  });

  socket.on("room:leave", ({ roomCode }) => {
    leaveRoomPresence(socket, roomCode);
    const nextRoomCode = String(roomCode || "")
      .trim()
      .toUpperCase();
    if (nextRoomCode) socket.leave(nextRoomCode);
  });

  socket.on("disconnect", () => {
    leaveRoomPresence(socket);
  });
});
