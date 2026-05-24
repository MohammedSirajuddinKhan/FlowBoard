import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import Room from "./models/Room.js";
import RoomMember from "./models/RoomMember.js";
import colors from "colors";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Session configuration
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongoUrl: process.env.MONGODB_URI,
    touchAfter: 24 * 3600,
  }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
});

app.use(sessionMiddleware);

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use(roomRoutes);

// Serve pages
app.get("/", async (req, res) => {
  if (!req.session.userId) {
    return res.render("login");
  }

  try {
    const ownedRoom = await Room.findOne({ owner: req.session.userId }).select(
      "roomCode",
    );

    if (ownedRoom?.roomCode) {
      return res.redirect(`/rooms/${ownedRoom.roomCode}`);
    }

    return res.render("index", {
      room: null,
      roomRole: null,
      invitePath: null,
      inviteUrl: null,
    });
  } catch (error) {
    console.error("Load home page error:", error);
    return res.status(500).json({ error: "Failed to load board" });
  }
});

app.get("/register", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  return res.render("register");
});

app.get("/login", (req, res) => {
  if (req.session.userId) {
    return res.redirect("/");
  }
  return res.render("login");
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: "Internal server error".bgRed });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`\FlowBoard server running on http://localhost:${PORT}`.bgGreen);
  console.log(`Make sure MongoDB is running`.america);
});

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
