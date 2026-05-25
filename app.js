import express from "express";
import session from "express-session";
import MongoStore from "connect-mongo";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import Room from "./models/Room.js";
import colors from "colors";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("trust proxy", 1);

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

export { sessionMiddleware };
export default app;
