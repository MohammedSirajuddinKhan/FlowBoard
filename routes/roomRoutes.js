import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  getTaskLineage,
} from "../controllers/taskController.js";
import {
  createRoom,
  deleteRoom,
  getRoomDetails,
  joinRoom,
  removeCrewMember,
  renderRoom,
  updateCrewRoles,
} from "../controllers/roomController.js";
import {
  requireRoomMembership,
  requireRoomRole,
} from "../middleware/roomAccess.js";

const router = express.Router();

router.post("/api/rooms", authMiddleware, createRoom);
router.get("/join/:roomCode", joinRoom);
router.get(
  "/rooms/:roomCode",
  authMiddleware,
  requireRoomMembership,
  renderRoom,
);
router.get(
  "/api/rooms/:roomCode",
  authMiddleware,
  requireRoomMembership,
  getRoomDetails,
);
router.get(
  "/api/rooms/:roomCode/tasks",
  authMiddleware,
  requireRoomMembership,
  getTasks,
);
router.get(
  "/api/rooms/:roomCode/tasks/:taskId/lineage",
  authMiddleware,
  requireRoomMembership,
  getTaskLineage,
);
router.patch(
  "/api/rooms/:roomCode/crew",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss"),
  updateCrewRoles,
);
router.post(
  "/api/rooms/:roomCode/tasks",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss", "rider"),
  createTask,
);
router.put(
  "/api/rooms/:roomCode/tasks/:taskId",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss", "rider"),
  updateTask,
);
router.delete(
  "/api/rooms/:roomCode/tasks/:taskId",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss", "rider"),
  deleteTask,
);
router.put(
  "/api/rooms/:roomCode/tasks/reorder/all",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss", "rider"),
  reorderTasks,
);
router.delete(
  "/api/rooms/:roomCode/crew/:memberId",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss"),
  removeCrewMember,
);
router.delete(
  "/api/rooms/:roomCode",
  authMiddleware,
  requireRoomMembership,
  requireRoomRole("boss"),
  deleteRoom,
);

export default router;
