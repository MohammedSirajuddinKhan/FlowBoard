import express from "express";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  reorderTasks,
  getTaskLineage,
} from "../controllers/taskController.js";
import authMiddleware from "../middleware/auth.js";

const router = express.Router();

// All task routes require authentication
router.use(authMiddleware);

router.get("/", getTasks);
router.get("/:taskId/lineage", getTaskLineage);
router.post("/", createTask);
router.put("/:taskId", updateTask);
router.delete("/:taskId", deleteTask);
router.put("/reorder/all", reorderTasks);

export default router;
