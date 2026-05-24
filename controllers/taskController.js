import Task from "../models/Task.js";

import TaskActivity from "../models/TaskActivity.js";
import User from "../models/User.js";

const ROOM_ROLE_LABELS = {
  boss: "Flow Boss",
  rider: "Flow Rider",
  watcher: "Flow Watcher",
  personal: "Personal",
};

const COLUMN_LABELS = {
  todo: "To Do",
  progress: "In Progress",
  done: "Done",
};

const ALLOWED_COLUMNS = new Set(["todo", "progress", "done"]);

const getScopeFilter = (req) => {
  if (req.room) {
    return { room: req.room._id };
  }

  return { userId: req.userId };
};

const getTaskFilter = (req, taskId) => ({
  _id: taskId,
  ...getScopeFilter(req),
});

const getIsRoomRequest = (req) => Boolean(req.room);

const canMutateTasks = (req) => {
  if (!getIsRoomRequest(req)) {
    return true;
  }

  return req.roomRole === "boss" || req.roomRole === "rider";
};

const getRoleLabel = (role) =>
  ROOM_ROLE_LABELS[role] || ROOM_ROLE_LABELS.personal;

const getColumnLabel = (column) => COLUMN_LABELS[column] || column;

const normalizeText = (value) => String(value || "").trim();

const normalizeColumn = (value) => {
  const column = String(value || "").trim();
  return ALLOWED_COLUMNS.has(column) ? column : null;
};

const getActorDisplay = async (req) => {
  const user = await User.findById(req.userId).select("email");
  return {
    email: user?.email || "Unknown",
    roleLabel: getRoleLabel(req.roomRole || "personal"),
  };
};

const emitTaskSync = (req, payload) => {
  const io = req.app.get("io");

  if (!io || !req.room?.roomCode) {
    return;
  }

  io.to(req.room.roomCode).emit("room:tasks-changed", {
    roomCode: req.room.roomCode,
    ...payload,
  });
};

const logTaskActivity = async ({
  req,
  task,
  action,
  message,
  fromColumn = null,
  toColumn = null,
  details = "",
}) => {
  await TaskActivity.create({
    room: req.room ? req.room._id : null,
    task: task._id,
    taskTitleSnapshot: task.title,
    action,
    message,
    fromColumn,
    toColumn,
    details,
    performedBy: req.userId,
    performedByRole: req.room ? req.roomRole : "personal",
  });
};

const buildActivityMessage = (
  actor,
  action,
  taskTitle,
  fromColumn,
  toColumn,
) => {
  if (action === "created") {
    return `${actor.email} (${actor.roleLabel}) created ${taskTitle}`;
  }

  if (action === "edited") {
    return `${actor.email} (${actor.roleLabel}) edited ${taskTitle}`;
  }

  if (action === "deleted") {
    return `${actor.email} (${actor.roleLabel}) deleted ${taskTitle}`;
  }

  return `${actor.email} (${actor.roleLabel}) moved ${taskTitle} from ${getColumnLabel(fromColumn)} to ${getColumnLabel(toColumn)}`;
};

const fetchTaskLineage = async (req, taskId) => {
  const filter = {
    task: taskId,
    ...getScopeFilter(req),
  };

  const activities = await TaskActivity.find(filter)
    .populate("performedBy", "email")
    .sort({ createdAt: -1 });

  return activities.map((activity) => ({
    id: activity._id,
    action: activity.action,
    message: activity.message,
    taskTitleSnapshot: activity.taskTitleSnapshot,
    fromColumn: activity.fromColumn,
    toColumn: activity.toColumn,
    details: activity.details,
    performedBy: {
      id: activity.performedBy?._id,
      email: activity.performedBy?.email,
      roleLabel: getRoleLabel(activity.performedByRole),
    },
    createdAt: activity.createdAt,
  }));
};

export const getTasks = async (req, res) => {
  try {
    const tasks = await Task.find(getScopeFilter(req))
      .populate("createdBy", "email")
      .populate("userId", "email")
      .sort({ column: 1, order: 1, createdAt: 1 });

    return res.status(200).json(tasks);
  } catch (error) {
    console.error("Get tasks error:", error);
    return res.status(500).json({ error: "Failed to fetch tasks" });
  }
};

export const createTask = async (req, res) => {
  try {
    if (!canMutateTasks(req)) {
      return res
        .status(403)
        .json({ error: "You cannot create tasks in this room" });
    }

    const title = normalizeText(req.body.title);
    const description = normalizeText(req.body.description);

    if (!title) {
      return res.status(400).json({ error: "Task title is required" });
    }

    const scopeFilter = getScopeFilter(req);
    const lastTask = await Task.findOne({
      ...scopeFilter,
      column: "todo",
    }).sort({ order: -1, createdAt: -1 });
    const order = lastTask ? lastTask.order + 1 : 0;

    const task = new Task({
      ...scopeFilter,
      title,
      description,
      column: "todo",
      order,
      userId: req.userId,
      createdBy: req.userId,
      createdByRole: req.room ? req.roomRole : "personal",
    });

    await task.save();

    const actor = await getActorDisplay(req);
    await logTaskActivity({
      req,
      task,
      action: "created",
      message: buildActivityMessage(actor, "created", task.title),
      toColumn: "todo",
    });

    emitTaskSync(req, {
      action: "created",
      taskId: task._id,
    });

    return res.status(201).json(task);
  } catch (error) {
    console.error("Create task error:", error);
    return res.status(500).json({ error: "Failed to create task" });
  }
};

export const updateTask = async (req, res) => {
  try {
    if (!canMutateTasks(req)) {
      return res
        .status(403)
        .json({ error: "You cannot modify tasks in this room" });
    }

    const { taskId } = req.params;
    const task = await Task.findOne(getTaskFilter(req, taskId));

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const nextTitle =
      req.body.title !== undefined ? normalizeText(req.body.title) : undefined;
    const nextDescription =
      req.body.description !== undefined
        ? normalizeText(req.body.description)
        : undefined;
    const nextColumn =
      req.body.column !== undefined
        ? normalizeColumn(req.body.column)
        : undefined;
    const nextOrder =
      req.body.order !== undefined ? Number(req.body.order) : undefined;

    if (req.body.column !== undefined && !nextColumn) {
      return res.status(400).json({ error: "Invalid task column" });
    }

    const previousTitle = task.title;
    const previousDescription = task.description;
    const previousColumn = task.column;

    if (nextTitle !== undefined) task.title = nextTitle;
    if (nextDescription !== undefined) task.description = nextDescription;
    if (nextColumn !== undefined) task.column = nextColumn;
    if (nextOrder !== undefined && Number.isFinite(nextOrder))
      task.order = nextOrder;

    await task.save();

    const actor = await getActorDisplay(req);
    const titleChanged = nextTitle !== undefined && nextTitle !== previousTitle;
    const descriptionChanged =
      nextDescription !== undefined && nextDescription !== previousDescription;
    const columnChanged =
      nextColumn !== undefined && nextColumn !== previousColumn;

    if (titleChanged || descriptionChanged) {
      await logTaskActivity({
        req,
        task,
        action: "edited",
        message: buildActivityMessage(actor, "edited", task.title),
      });
    }

    if (columnChanged) {
      await logTaskActivity({
        req,
        task,
        action: "moved",
        message: buildActivityMessage(
          actor,
          "moved",
          task.title,
          previousColumn,
          task.column,
        ),
        fromColumn: previousColumn,
        toColumn: task.column,
      });
    }

    if (
      titleChanged ||
      descriptionChanged ||
      columnChanged ||
      nextOrder !== undefined
    ) {
      emitTaskSync(req, {
        action: columnChanged
          ? "moved"
          : titleChanged || descriptionChanged
            ? "edited"
            : "reordered",
        taskId: task._id,
      });
    }

    return res.status(200).json(task);
  } catch (error) {
    console.error("Update task error:", error);
    return res.status(500).json({ error: "Failed to update task" });
  }
};

export const deleteTask = async (req, res) => {
  try {
    if (!canMutateTasks(req)) {
      return res
        .status(403)
        .json({ error: "You cannot delete tasks in this room" });
    }

    const { taskId } = req.params;
    const task = await Task.findOne(getTaskFilter(req, taskId));

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const actor = await getActorDisplay(req);
    await logTaskActivity({
      req,
      task,
      action: "deleted",
      message: buildActivityMessage(actor, "deleted", task.title),
    });

    await Task.deleteOne({ _id: taskId });

    emitTaskSync(req, {
      action: "deleted",
      taskId: task._id,
    });

    return res.status(200).json({ message: "Task deleted" });
  } catch (error) {
    console.error("Delete task error:", error);
    return res.status(500).json({ error: "Failed to delete task" });
  }
};

export const reorderTasks = async (req, res) => {
  try {
    if (!canMutateTasks(req)) {
      return res
        .status(403)
        .json({ error: "You cannot reorder tasks in this room" });
    }

    const { tasks } = req.body;

    if (!Array.isArray(tasks)) {
      return res.status(400).json({ error: "Invalid request" });
    }

    const actor = await getActorDisplay(req);

    for (let i = 0; i < tasks.length; i += 1) {
      const { _id, column, order } = tasks[i];
      const nextColumn = normalizeColumn(column);

      if (!nextColumn) {
        return res.status(400).json({ error: "Invalid task column" });
      }

      const task = await Task.findOne(getTaskFilter(req, _id));

      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      const previousColumn = task.column;
      task.column = nextColumn;
      task.order = order;
      await task.save();

      if (previousColumn !== nextColumn) {
        await logTaskActivity({
          req,
          task,
          action: "moved",
          message: buildActivityMessage(
            actor,
            "moved",
            task.title,
            previousColumn,
            nextColumn,
          ),
          fromColumn: previousColumn,
          toColumn: nextColumn,
        });
      }
    }

    emitTaskSync(req, {
      action: "reordered",
    });

    return res.status(200).json({ message: "Tasks reordered" });
  } catch (error) {
    console.error("Reorder tasks error:", error);
    return res.status(500).json({ error: "Failed to reorder tasks" });
  }
};

export const getTaskLineage = async (req, res) => {
  try {
    const { taskId } = req.params;
    const lineage = await fetchTaskLineage(req, taskId);

    return res.status(200).json({ lineage });
  } catch (error) {
    console.error("Get task lineage error:", error);
    return res.status(500).json({ error: "Failed to load task lineage" });
  }
};
