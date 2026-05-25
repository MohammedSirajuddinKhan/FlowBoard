// DOM Elements
const columns = {
  todo: document.getElementById("todo"),
  progress: document.getElementById("progress"),
  done: document.getElementById("done"),
};

const columnContainers = {
  todo: document.querySelector("#todo .tasks"),
  progress: document.querySelector("#progress .tasks"),
  done: document.querySelector("#done .tasks"),
};

const modal = document.getElementById("taskModal");
const lineageModal = document.getElementById("lineageModal");
const crewModal = document.getElementById("crewModal");
const crewRoomModal = document.getElementById("crewRoomModal");
const taskForm = document.getElementById("taskForm");
const crewRoomForm = document.getElementById("crewRoomForm");
const addTaskBtn = document.getElementById("addTaskBtn");
const crewBtn = document.getElementById("crewBtn");
const logoutBtn = document.getElementById("logoutBtn");
const taskCloseBtn = document.getElementById("taskCloseBtn");
const lineageCloseBtn = document.getElementById("lineageCloseBtn");
const lineageCancelBtn = document.getElementById("lineageCancelBtn");
const crewCloseBtn = document.getElementById("crewCloseBtn");
const crewRoomCloseBtn = document.getElementById("crewRoomCloseBtn");
const cancelBtn = document.querySelector(".btn-cancel");
const crewCancelBtn = document.getElementById("crewCancelBtn");
const crewRoomCancelBtn = document.getElementById("crewRoomCancelBtn");
const crewRoomNameInput = document.getElementById("crewRoomNameInput");
const deployCrewBtn = document.getElementById("deployCrewBtn");
const deleteRoomBtn = document.getElementById("deleteRoomBtn");
const lineageTitle = document.getElementById("lineageTitle");
const lineageSummary = document.getElementById("lineageSummary");
const lineageList = document.getElementById("lineageList");
const crewStatus = document.getElementById("crewStatus");
const crewMembersList = document.getElementById("crewMembersList");
const inviteLink = document.getElementById("inviteLink");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const memberTotal = document.getElementById("memberTotal");
const currentRoleLabel = document.getElementById("currentRoleLabel");
const crewRoomName = document.getElementById("crewRoomName");
const roomDisplayName = document.getElementById("roomDisplayName");
const livePresence = document.getElementById("livePresence");
const presenceDot = document.getElementById("presenceDot");
const realtimeToast = document.getElementById("realtimeToast");

const flowboardState = window.__FLOWBOARD__ || {};
const presencePalette = [
  "#006466",
  "#065A60",
  "#0B525B",
  "#144552",
  "#1B3A4B",
  "#212F45",
  "#272640",
  "#312244",
  "#3E1F47",
  "#4D194D",
];
let roomContext = flowboardState.room || null;
let currentRoomRole = flowboardState.roomRole || null;
let socketClient =
  typeof window.io === "function" && roomContext
    ? window.io({ path: "/socket.io" })
    : null;

let allTasks = [];
let editingTaskId = null;
let roomMembers = [];
let crewDraftRoles = new Map();
let crewLoaded = false;
let selectedLineageTask = null;
let selectedLineageEntries = [];
let syncReloadTimer = null;
let toastTimer = null;
let isDeployingCrew = false;
let realtimeBound = false;
let presenceTimer = null;
let pendingTaskTransfer = null;

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadTasks();
  if (roomContext) {
    loadRoomDetails();
    ensureSocketClient();
  }
  setupEventListeners();
});

function ensureSocketClient() {
  if (typeof window.io !== "function") {
    return;
  }

  if (!socketClient) {
    socketClient = window.io({ path: "/socket.io" });
  }

  connectRealtimeSync();
}

// Load tasks from API
async function loadTasks() {
  try {
    // show global loader during initial data fetch
    if (window.Loader && typeof window.Loader.show === "function") {
      window.Loader.show();
    }
    const response = await fetch(getTaskApiBase());
    if (!response.ok) throw new Error("Failed to load tasks");
    allTasks = await response.json();
    renderTasks();
  } catch (error) {
    console.error("Load tasks error:", error);
    alert("Failed to load tasks. Please refresh the page.");
  } finally {
    if (window.Loader && typeof window.Loader.hide === "function") {
      window.Loader.hide();
    }
  }
}

async function loadRoomDetails() {
  if (!roomContext?.roomCode) return;

  try {
    const response = await fetch(`/api/rooms/${roomContext.roomCode}`);

    if (!response.ok) {
      throw new Error("Failed to load room details");
    }

    const data = await response.json();
    roomContext = data.room;
    currentRoomRole = data.currentMember?.role || currentRoomRole;
    flowboardState.invitePath =
      data.room?.invitePath || flowboardState.invitePath;
    flowboardState.inviteUrl = data.room?.inviteUrl || flowboardState.inviteUrl;
    roomMembers = Array.isArray(data.members) ? data.members : [];
    crewDraftRoles = new Map(
      roomMembers
        .filter((member) => member.role !== "boss")
        .map((member) => [member.id, member.role]),
    );

    updateRoomBadge();
    renderCrewModal();
    crewLoaded = true;

    if (socketClient?.connected && roomContext?.roomCode) {
      socketClient.emit("room:join", { roomCode: roomContext.roomCode });
    }
  } catch (error) {
    console.error("Load room details error:", error);
    setCrewStatus("Unable to load crew details. Refresh the page.", true);
  }
}

function updateRoomBadge() {
  const roleBadge = document.querySelector("nav .left .role-pill");
  if (roleBadge && currentRoomRole) {
    roleBadge.textContent = getRoleLabel(currentRoomRole);
    roleBadge.className = `role-pill role-${currentRoomRole}`;
  }

  if (inviteLink) {
    inviteLink.value = getInviteLink();
  }

  if (roomDisplayName) {
    roomDisplayName.textContent = roomContext?.name || "";
  }

  if (crewRoomName) {
    crewRoomName.textContent = roomContext?.name || "No Room Deployed";
  }

  if (currentRoleLabel) {
    currentRoleLabel.textContent = roomContext
      ? getRoleLabel(currentRoomRole)
      : "Unassigned";
  }

  if (memberTotal) {
    memberTotal.textContent = String(roomMembers.length || 0);
  }

  flowboardState.roomRole = currentRoomRole;
  flowboardState.room = roomContext;

  if (addTaskBtn) {
    const readOnlyRoom = !!roomContext && currentRoomRole === "watcher";
    addTaskBtn.disabled = readOnlyRoom;
    addTaskBtn.style.display =
      roomContext && readOnlyRoom ? "none" : "inline-flex";
    addTaskBtn.textContent =
      roomContext && readOnlyRoom ? "View Only" : "Add New Task";
  }

  if (crewBtn) {
    if (roomContext && currentRoomRole === "boss") {
      crewBtn.style.display = "inline-flex";
      crewBtn.dataset.crewMode = "monitor";
      crewBtn.textContent = "Monitor Crew";
    } else if (!roomContext) {
      crewBtn.style.display = "inline-flex";
      crewBtn.dataset.crewMode = "deploy";
      crewBtn.textContent = "Deploy Crew";
    } else {
      crewBtn.style.display = "none";
    }
  }

  updatePresenceBadge(0);
}

function getInviteLink() {
  if (flowboardState.inviteUrl) return flowboardState.inviteUrl;
  if (!roomContext?.roomCode) return "";
  return `${window.location.origin}/join/${roomContext.roomCode}`;
}

function connectRealtimeSync() {
  if (!socketClient) return;

  if (realtimeBound) {
    if (roomContext?.roomCode && socketClient.connected) {
      socketClient.emit("room:join", { roomCode: roomContext.roomCode });
    }
    return;
  }

  realtimeBound = true;

  socketClient.on("connect", () => {
    if (roomContext?.roomCode) {
      socketClient.emit("room:join", { roomCode: roomContext.roomCode });
    }
    showRealtimeToast("Connected to live room", "success");
  });

  socketClient.on("room:joined", ({ roomCode }) => {
    if (roomCode === roomContext.roomCode) {
      console.log("Joined realtime room", roomCode);
    }
  });

  socketClient.on("room:tasks-changed", ({ roomCode, action }) => {
    if (!roomContext || roomCode !== roomContext.roomCode) return;

    showRealtimeToast(`Task update received: ${action || "sync"}`);
    scheduleBoardRefresh(action || "tasks-changed");
  });

  socketClient.on("room:crew-changed", ({ roomCode, action }) => {
    if (!roomContext || roomCode !== roomContext.roomCode) return;

    showRealtimeToast(`Crew update received: ${action || "sync"}`);
    scheduleCrewRefresh(action || "crew-changed");
  });

  socketClient.on("room:presence", ({ roomCode, onlineCount }) => {
    if (!roomContext || roomCode !== roomContext.roomCode) return;

    updatePresenceBadge(onlineCount);
  });

  socketClient.on("room:deleted", ({ roomCode, message }) => {
    if (!roomContext || roomCode !== roomContext.roomCode) return;

    showRealtimeToast(message || "Room deleted", "info");
    window.location.href = "/";
  });

  window.addEventListener("beforeunload", handleBeforeUnload, { once: true });
}

function scheduleBoardRefresh(reason = "sync") {
  if (syncReloadTimer) {
    clearTimeout(syncReloadTimer);
  }

  syncReloadTimer = setTimeout(async () => {
    try {
      await loadTasks();
      if (roomContext) {
        await loadRoomDetails();
      }
      showRealtimeToast(`Board synced: ${reason}`);
    } catch (error) {
      console.error("Realtime board refresh error:", error);
    }
  }, 120);
}

function scheduleCrewRefresh(reason = "sync") {
  if (syncReloadTimer) {
    clearTimeout(syncReloadTimer);
  }

  syncReloadTimer = setTimeout(async () => {
    try {
      if (roomContext) {
        await loadRoomDetails();
      }
      await loadTasks();
      showRealtimeToast(`Crew synced: ${reason}`);
    } catch (error) {
      console.error("Realtime crew refresh error:", error);
    }
  }, 120);
}

function updatePresenceBadge(onlineCount) {
  if (!livePresence) return;

  const count = Number.isFinite(Number(onlineCount)) ? Number(onlineCount) : 0;
  livePresence.textContent = `${count} online`;

  if (presenceDot) {
    setPresenceDotColor();

    if (!presenceTimer) {
      presenceTimer = setInterval(setPresenceDotColor, 1000);
    }
  }
}

function setPresenceDotColor() {
  if (!presenceDot) return;

  const nextColor =
    presencePalette[Math.floor(Math.random() * presencePalette.length)];
  presenceDot.style.setProperty("--presence-color", nextColor);
}

function showRealtimeToast(message, kind = "info") {
  if (!realtimeToast) return;

  realtimeToast.textContent = message;
  realtimeToast.dataset.kind = kind;
  realtimeToast.classList.add("visible");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    realtimeToast.classList.remove("visible");
  }, 1800);
}

function handleBeforeUnload() {
  if (!socketClient || !roomContext?.roomCode) return;

  socketClient.emit("room:leave", { roomCode: roomContext.roomCode });
  socketClient.disconnect();
}

function getRoleLabel(role) {
  if (role === "boss") return "Flow Boss";
  if (role === "rider") return "Flow Rider";
  return "Flow Watcher";
}

function getTaskApiBase() {
  if (roomContext?.roomCode) {
    return `/api/rooms/${roomContext.roomCode}/tasks`;
  }

  return "/api/tasks";
}

function getTaskLineageApi(taskId) {
  if (roomContext?.roomCode) {
    return `/api/rooms/${roomContext.roomCode}/tasks/${taskId}/lineage`;
  }

  return `/api/tasks/${taskId}/lineage`;
}

function canMutateTasks() {
  return !roomContext || currentRoomRole !== "watcher";
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTaskCreatorLabel(task) {
  const email = task.createdBy?.email || task.userId?.email || "Unknown";
  const role = task.createdByRole || "personal";
  return `${email} (${getRoleLabel(role)})`;
}

function setLineageState(task, entries) {
  selectedLineageTask = task;
  selectedLineageEntries = Array.isArray(entries) ? entries : [];
}

function renderLineageModal() {
  if (!lineageModal || !selectedLineageTask) return;

  lineageTitle.textContent = `Lineage: ${selectedLineageTask.title}`;
  lineageSummary.innerHTML = `
    <strong>${escapeHtml(selectedLineageTask.title)}</strong>
    <div>Created by ${escapeHtml(getTaskCreatorLabel(selectedLineageTask))} on ${escapeHtml(formatDateTime(selectedLineageTask.createdAt))}</div>
    <div>Last updated ${escapeHtml(formatDateTime(selectedLineageTask.updatedAt))}</div>
  `;

  if (!selectedLineageEntries.length) {
    lineageList.innerHTML =
      '<div class="lineage-empty">No activity recorded yet.</div>';
    return;
  }

  lineageList.innerHTML = selectedLineageEntries
    .map((entry) => {
      const timestamp = formatDateTime(entry.createdAt);
      const actor = entry.performedBy?.email || "Unknown";
      const role = entry.performedBy?.roleLabel || "Unknown Role";
      return `
        <article class="lineage-item">
          <strong>${escapeHtml(entry.message || "Activity")}</strong>
          <span>${escapeHtml(actor)} (${escapeHtml(role)})</span>
          <span>${escapeHtml(timestamp)}</span>
        </article>
      `;
    })
    .join("");
}

function openLineageModal(task, entries) {
  setLineageState(task, entries);
  renderLineageModal();
  lineageModal.style.display = "flex";
}

function closeLineageModal() {
  if (!lineageModal) return;

  lineageModal.style.display = "none";
  selectedLineageTask = null;
  selectedLineageEntries = [];
}

function setCrewStatus(message, isError = false) {
  if (!crewStatus) return;

  crewStatus.textContent = message;
  crewStatus.classList.toggle("error", Boolean(isError));
}

function getNonBossMembers() {
  return roomMembers.filter((member) => member.role !== "boss");
}

function renderCrewModal() {
  if (!crewModal) return;

  const members = [...roomMembers].sort((left, right) => {
    const roleOrder = { boss: 0, rider: 1, watcher: 2 };
    const leftRank = roleOrder[left.role] ?? 99;
    const rightRank = roleOrder[right.role] ?? 99;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return new Date(left.joinedAt) - new Date(right.joinedAt);
  });

  if (memberTotal) {
    memberTotal.textContent = String(roomMembers.length || 0);
  }
  if (currentRoleLabel) {
    currentRoleLabel.textContent = roomContext
      ? getRoleLabel(currentRoomRole)
      : "Unassigned";
  }
  if (inviteLink) {
    inviteLink.value = getInviteLink();
  }
  if (crewRoomName) {
    crewRoomName.textContent = roomContext?.name || "No Room Deployed";
  }

  if (crewMembersList) {
    crewMembersList.innerHTML = members.length
      ? members.map((member) => createCrewMemberMarkup(member)).join("")
      : '<div class="crew-empty">No members in this room yet.</div>';

    members.forEach((member) => {
      const root = crewMembersList.querySelector(
        `[data-member-id="${member.id}"]`,
      );
      if (!root) return;

      const riderToggle = root.querySelector(`[data-role-toggle="rider"]`);
      const watcherToggle = root.querySelector(`[data-role-toggle="watcher"]`);

      if (member.role === "boss") {
        return;
      }

      const initialRole = crewDraftRoles.get(member.id) || member.role;

      if (riderToggle && watcherToggle) {
        riderToggle.checked = initialRole === "rider";
        watcherToggle.checked = initialRole === "watcher";

        const syncRoleSelection = (nextRole) => {
          crewDraftRoles.set(member.id, nextRole);
          riderToggle.checked = nextRole === "rider";
          watcherToggle.checked = nextRole === "watcher";
        };

        riderToggle.addEventListener("change", () => {
          if (riderToggle.checked) {
            syncRoleSelection("rider");
          } else if (!watcherToggle.checked) {
            syncRoleSelection("watcher");
          }
        });

        watcherToggle.addEventListener("change", () => {
          if (watcherToggle.checked) {
            syncRoleSelection("watcher");
          } else if (!riderToggle.checked) {
            syncRoleSelection("rider");
          }
        });
      }
    });
  }

  if (deployCrewBtn) {
    deployCrewBtn.disabled = currentRoomRole !== "boss";
    deployCrewBtn.textContent =
      currentRoomRole === "boss" ? "Deply Changes" : "Read Only";
  }
}

function createCrewMemberMarkup(member) {
  const email = escapeHtml(member.user?.email || "member@flowboard");
  const roleClass = `role-${member.role}`;
  const roleLabel = escapeHtml(member.roleLabel || getRoleLabel(member.role));
  const isBoss = member.role === "boss";
  const disabledAttr = currentRoomRole !== "boss" || isBoss ? "disabled" : "";
  const currentSelection = crewDraftRoles.get(member.id) || member.role;

  return `
    <div class="crew-table-row" data-member-id="${member.id}">
      <div class="crew-cell crew-cell-name">
        <strong>${email}</strong>
      </div>
      <div class="crew-cell crew-cell-role">
        <span class="crew-role-badge ${roleClass}">${roleLabel}</span>
      </div>
      <div class="crew-cell crew-cell-powers">
        <label class="crew-power-option">
          <input type="checkbox" data-role-toggle="rider" ${currentSelection === "rider" ? "checked" : ""} ${disabledAttr} />
          Rider
        </label>
        <label class="crew-power-option">
          <input type="checkbox" data-role-toggle="watcher" ${currentSelection === "watcher" ? "checked" : ""} ${disabledAttr} />
          Watcher
        </label>
      </div>
    </div>
  `;
}

function openCrewModal() {
  if (!crewModal) return;
  if (!roomContext?.roomCode) {
    return;
  }
  if (currentRoomRole !== "boss") {
    return;
  }

  crewModal.style.display = "flex";
  setCrewStatus(crewLoaded ? "Crew loaded." : "Loading crew...", false);
  if (!crewLoaded) {
    loadRoomDetails();
  }
}

function openCrewRoomModal() {
  if (!crewRoomModal || !crewRoomNameInput) return;

  crewRoomNameInput.value = roomContext?.name || "";
  crewRoomModal.style.display = "flex";
  crewRoomNameInput.focus();
}

function closeCrewRoomModal() {
  if (!crewRoomModal) return;

  crewRoomModal.style.display = "none";
  crewRoomForm?.reset();
}

async function deployCrewRoom(roomName) {
  if (isDeployingCrew) return;

  const normalizedName = String(roomName || "").trim();

  if (!normalizedName) {
    throw new Error("Crew name is required.");
  }

  isDeployingCrew = true;
  if (crewBtn) {
    crewBtn.disabled = true;
    crewBtn.textContent = "Deploying...";
  }

  try {
    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: normalizedName }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to deploy room");
    }

    roomContext = data.room
      ? {
          id: data.room._id || data.room.id,
          name: data.room.name,
          roomCode: data.room.roomCode,
        }
      : null;
    currentRoomRole = "boss";
    flowboardState.invitePath = data.invitePath || null;
    flowboardState.inviteUrl = data.inviteUrl || null;
    crewLoaded = false;

    updateRoomBadge();
    ensureSocketClient();

    if (roomContext?.roomCode) {
      window.history.replaceState({}, "", `/rooms/${roomContext.roomCode}`);
    }

    await loadRoomDetails();
    await loadTasks();
    openCrewModal();
    showRealtimeToast(
      data.existing
        ? "Existing crew room loaded"
        : "Crew deployed successfully",
      "success",
    );
    return data;
  } catch (error) {
    console.error("Deploy crew room error:", error);
    alert(error.message || "Failed to deploy crew room");
    throw error;
  } finally {
    isDeployingCrew = false;
    updateRoomBadge();
    if (crewBtn) {
      crewBtn.disabled = false;
    }
  }
}

async function deleteCurrentRoom() {
  if (!roomContext?.roomCode) {
    return;
  }

  if (currentRoomRole !== "boss") {
    setCrewStatus("Only the Flow Boss can delete this room.", true);
    return;
  }

  const confirmed = confirm(
    `Delete room ${roomContext.name}? This removes all room tasks and crew data.`,
  );
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/rooms/${roomContext.roomCode}`, {
      method: "DELETE",
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to delete room");
    }

    if (socketClient && roomContext?.roomCode) {
      socketClient.emit("room:leave", { roomCode: roomContext.roomCode });
    }

    showRealtimeToast("Room deleted", "success");
    window.location.href = "/";
  } catch (error) {
    console.error("Delete room error:", error);
    setCrewStatus(error.message || "Failed to delete room.", true);
  }
}

async function copyInviteLink() {
  const link = getInviteLink();
  if (!link) {
    setCrewStatus("Invite link is not available yet.", true);
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      const fallbackInput = document.createElement("input");
      fallbackInput.value = link;
      document.body.appendChild(fallbackInput);
      fallbackInput.select();
      document.execCommand("copy");
      document.body.removeChild(fallbackInput);
    }
    setCrewStatus("Invite link copied.", false);
  } catch (error) {
    console.error("Copy invite link error:", error);
    setCrewStatus("Unable to copy invite link.", true);
  }
}

function closeCrewModal() {
  if (!crewModal) return;

  crewModal.style.display = "none";
}

async function deployCrewChanges() {
  if (currentRoomRole !== "boss") {
    setCrewStatus("Only the Flow Boss can deploy crew changes.", true);
    return;
  }

  const nonBossMembers = getNonBossMembers();
  const updates = nonBossMembers
    .map((member) => ({
      memberId: member.id,
      role: crewDraftRoles.get(member.id) || member.role,
      originalRole: member.role,
    }))
    .filter((update) => update.role !== update.originalRole)
    .map(({ memberId, role }) => ({ memberId, role }));

  if (updates.length === 0) {
    setCrewStatus("No crew changes to deploy.", false);
    return;
  }

  try {
    const response = await fetch(`/api/rooms/${roomContext.roomCode}/crew`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ members: updates }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to deploy crew");
    }

    roomMembers = Array.isArray(data.members) ? data.members : [];
    crewDraftRoles = new Map(
      roomMembers
        .filter((member) => member.role !== "boss")
        .map((member) => [member.id, member.role]),
    );
    renderCrewModal();
    setCrewStatus("Crew deployed successfully.", false);
  } catch (error) {
    console.error("Deploy crew error:", error);
    setCrewStatus(error.message || "Failed to deploy crew.", true);
  }
}

// Render tasks on the board
function renderTasks() {
  // Clear all columns
  Object.values(columnContainers).forEach((container) => {
    container.innerHTML = "";
  });

  // Organize tasks by column
  const tasksByColumn = {
    todo: [],
    progress: [],
    done: [],
  };

  allTasks.forEach((task) => {
    if (tasksByColumn[task.column]) {
      tasksByColumn[task.column].push(task);
    }
  });

  // Render each column
  Object.entries(tasksByColumn).forEach(([column, tasks]) => {
    const container = columnContainers[column];

    // Sort by order
    tasks.sort((a, b) => a.order - b.order);

    tasks.forEach((task, index) => {
      const taskEl = createTaskElement(task);
      if (
        pendingTaskTransfer?.taskId === task._id &&
        pendingTaskTransfer?.toColumn === column
      ) {
        taskEl.classList.add("task-transfer-arrive");
      }
      container.appendChild(taskEl);
    });

    // Update count
    const count = container.parentElement.querySelector(".count");
    count.textContent = tasks.length;
  });

  // Reattach drag listeners
  attachDragListeners();

  if (pendingTaskTransfer) {
    animateTaskTransfer(pendingTaskTransfer);
    pendingTaskTransfer = null;
  }
}

// Create task element
function createTaskElement(task) {
  const taskEl = document.createElement("div");
  taskEl.className =
    `task task-column-${task.column} ${task.column === "done" ? "task-done" : ""}`.trim();
  taskEl.draggable = canMutateTasks();
  taskEl.dataset.taskId = task._id;
  taskEl.dataset.column = task.column;

  const descriptionHtml = task.description
    ? `<p>${escapeHtml(task.description)}</p>`
    : "";

  const actionButtons = canMutateTasks()
    ? `
      <button type="button" class="task-btn task-btn-lineage">Lineage</button>
      <button type="button" class="task-btn task-btn-edit">Edit</button>
      <button type="button" class="task-btn task-btn-delete">Delete</button>
    `
    : `
      <button type="button" class="task-btn task-btn-lineage">Lineage</button>
    `;

  taskEl.innerHTML = `
    <div class="task-title-row">
      <h3>${escapeHtml(task.title)}</h3>
      ${task.column === "done" ? '<span class="task-done-icon">✓</span>' : ""}
    </div>
    ${descriptionHtml}
    <div class="task-actions">
      ${actionButtons}
    </div>
  `;

  const lineageBtn = taskEl.querySelector(".task-btn-lineage");
  const editBtn = taskEl.querySelector(".task-btn-edit");
  const deleteBtn = taskEl.querySelector(".task-btn-delete");

  lineageBtn?.addEventListener("click", () => viewTaskLineage(task));
  editBtn?.addEventListener("click", () => openEditModal(task));
  deleteBtn?.addEventListener("click", () => deleteTask(task._id));

  return taskEl;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

function getTaskColumnIcon(column) {
  return "";
}

// Open task modal
function openTaskModal() {
  if (!canMutateTasks()) {
    return;
  }

  editingTaskId = null;
  document.getElementById("modalTitle").textContent = "Add New Task";
  taskForm.reset();
  modal.style.display = "flex";
  document.getElementById("taskTitle").focus();
}

// Open edit modal
function openEditModal(task) {
  if (!canMutateTasks()) {
    return;
  }

  editingTaskId = task._id;
  document.getElementById("modalTitle").textContent = "Edit Task";
  document.getElementById("taskTitle").value = task.title;
  document.getElementById("taskDescription").value = task.description || "";
  modal.style.display = "flex";
  document.getElementById("taskTitle").focus();
}

// Close modal
function closeTaskModal() {
  modal.style.display = "none";
  editingTaskId = null;
  taskForm.reset();
}

// Submit task form
taskForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!canMutateTasks()) {
    alert("This room is read-only.");
    return;
  }

  const title = document.getElementById("taskTitle").value.trim();
  const description = document.getElementById("taskDescription").value.trim();

  if (!title) {
    alert("Task title is required");
    return;
  }

  try {
    let response;
    const taskApiBase = getTaskApiBase();

    if (editingTaskId) {
      // Update existing task
      response = await fetch(`${taskApiBase}/${editingTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
    } else {
      // Create new task
      response = await fetch(taskApiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
    }

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to save task");
      return;
    }

    closeTaskModal();
    loadTasks();
  } catch (error) {
    console.error("Save task error:", error);
    alert("Failed to save task. Please try again.");
  }
});

// Delete task
async function deleteTask(taskId) {
  if (!canMutateTasks()) {
    alert("This room is read-only.");
    return;
  }

  if (!confirm("Are you sure you want to delete this task?")) return;

  try {
    const response = await fetch(`${getTaskApiBase()}/${taskId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to delete task");
      return;
    }

    loadTasks();
  } catch (error) {
    console.error("Delete task error:", error);
    alert("Failed to delete task. Please try again.");
  }
}

// Drag and drop
let draggedElement = null;

function attachDragListeners() {
  if (!canMutateTasks()) {
    return;
  }

  const tasks = document.querySelectorAll(".task");
  const taskColumns = document.querySelectorAll(".task-column");

  tasks.forEach((task) => {
    task.addEventListener("dragstart", handleDragStart);
    task.addEventListener("dragend", handleDragEnd);
  });

  taskColumns.forEach((column) => {
    column.addEventListener("dragover", handleDragOver);
    column.addEventListener("drop", handleDrop);
    column.addEventListener("dragleave", handleDragLeave);
  });
}

function handleDragStart(e) {
  if (!canMutateTasks()) return;

  draggedElement = this;
  this.style.opacity = "0.5";
}

function handleDragEnd(e) {
  if (draggedElement) {
    draggedElement.style.opacity = "1";
    draggedElement = null;
  }
  document.querySelectorAll(".task-column").forEach((col) => {
    col.classList.remove("drag-over");
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  this.classList.add("drag-over");
}

function handleDragLeave(e) {
  if (e.target === this) {
    this.classList.remove("drag-over");
  }
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");

  if (!canMutateTasks()) return;

  if (!draggedElement) return;

  const taskId = draggedElement.dataset.taskId;
  const newColumn = this.id;
  const taskContainer = this.querySelector(".tasks");
  const sourceColumn = draggedElement.dataset.column;
  const sourceRect = draggedElement.getBoundingClientRect();

  // Update task's column
  const taskIndex = allTasks.findIndex((t) => t._id === taskId);
  if (taskIndex !== -1) {
    allTasks[taskIndex].column = newColumn;
  }

  // Reorder based on position
  const tasksInColumn = taskContainer.querySelectorAll(".task");
  const newOrder = Array.from(tasksInColumn).indexOf(draggedElement);

  try {
    await fetch(`${getTaskApiBase()}/${taskId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        column: newColumn,
        order: newOrder >= 0 ? newOrder : 0,
      }),
    });

    pendingTaskTransfer = {
      taskId,
      fromRect: sourceRect,
      fromColumn: sourceColumn,
      toColumn: newColumn,
    };

    renderTasks();
  } catch (error) {
    console.error("Update task position error:", error);
    alert("Failed to update task position. Please refresh the page.");
  }
}

function animateTaskTransfer(transfer) {
  if (!transfer?.fromRect) return;

  const target = document.querySelector(`[data-task-id="${transfer.taskId}"]`);

  if (!target) return;

  const targetRect = target.getBoundingClientRect();
  const clone = target.cloneNode(true);
  const fromColumnIndex = getTaskColumnIndex(transfer.fromColumn);
  const toColumnIndex = getTaskColumnIndex(transfer.toColumn);
  const direction = toColumnIndex >= fromColumnIndex ? 1 : -1;
  const horizontalDistance = Math.max(
    96,
    Math.abs(targetRect.left - transfer.fromRect.left),
  );
  const settleX = targetRect.left - transfer.fromRect.left;
  const settleY = targetRect.top - transfer.fromRect.top;
  const liftY = -10;

  clone.classList.add("task-transfer-clone");
  clone.style.position = "fixed";
  clone.style.left = `${transfer.fromRect.left}px`;
  clone.style.top = `${transfer.fromRect.top}px`;
  clone.style.width = `${transfer.fromRect.width}px`;
  clone.style.height = `${transfer.fromRect.height}px`;
  clone.style.margin = "0";
  clone.style.pointerEvents = "none";
  clone.style.zIndex = "2000";
  clone.style.transform = "translate(0, 0) scale(1)";
  clone.style.transition = "none";

  document.body.appendChild(clone);

  target.classList.add("task-transfer-arrive");

  requestAnimationFrame(() => {
    clone.animate(
      [
        {
          transform: "translate(0, 0) scale(1)",
          opacity: 0.98,
          filter: "blur(0px)",
        },
        {
          transform: `translate(${direction * (horizontalDistance * 0.6)}px, ${liftY}px) scale(0.97)`,
          opacity: 0.9,
          filter: "blur(0px)",
        },
        {
          transform: `translate(${settleX}px, ${settleY}px) scale(0.95)`,
          opacity: 0,
          filter: "blur(1px)",
        },
      ],
      {
        duration: 560,
        easing: "cubic-bezier(0.2, 0.85, 0.2, 1)",
        fill: "forwards",
      },
    ).onfinish = () => clone.remove();

    target.animate(
      [
        { transform: "translateY(10px) scale(0.98)", opacity: 0.55 },
        { transform: "translateY(0) scale(1)", opacity: 1 },
      ],
      {
        duration: 420,
        easing: "cubic-bezier(0.2, 0.85, 0.2, 1)",
      },
    );
  });
}

function getTaskColumnIndex(column) {
  if (column === "todo") return 0;
  if (column === "progress") return 1;
  if (column === "done") return 2;
  return 0;
}

async function viewTaskLineage(task) {
  try {
    const response = await fetch(getTaskLineageApi(task._id));
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to load lineage");
    }

    openLineageModal(task, data.lineage || []);
  } catch (error) {
    console.error("Load lineage error:", error);
    alert(error.message || "Failed to load lineage");
  }
}

// Setup event listeners
function setupEventListeners() {
  addTaskBtn?.addEventListener("click", openTaskModal);
  if (crewBtn) {
    crewBtn.addEventListener("click", () => {
      if (roomContext?.roomCode) {
        openCrewModal();
        return;
      }

      openCrewRoomModal();
    });
  }

  taskCloseBtn.addEventListener("click", closeTaskModal);
  lineageCloseBtn?.addEventListener("click", closeLineageModal);
  lineageCancelBtn?.addEventListener("click", closeLineageModal);
  cancelBtn.addEventListener("click", closeTaskModal);
  crewCloseBtn?.addEventListener("click", closeCrewModal);
  crewCancelBtn?.addEventListener("click", closeCrewModal);
  deployCrewBtn?.addEventListener("click", deployCrewChanges);
  copyInviteBtn?.addEventListener("click", copyInviteLink);
  deleteRoomBtn?.addEventListener("click", deleteCurrentRoom);
  crewRoomCloseBtn?.addEventListener("click", closeCrewRoomModal);
  crewRoomCancelBtn?.addEventListener("click", closeCrewRoomModal);

  crewRoomForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      await deployCrewRoom(crewRoomNameInput?.value || "");
      closeCrewRoomModal();
    } catch (error) {
      console.error("Deploy crew room form error:", error);
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeTaskModal();
  });

  lineageModal?.addEventListener("click", (e) => {
    if (e.target === lineageModal) closeLineageModal();
  });

  crewModal?.addEventListener("click", (e) => {
    if (e.target === crewModal) closeCrewModal();
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        window.location.href = "/login";
      }
    } catch (error) {
      console.error("Logout error:", error);
      alert("Logout failed. Please try again.");
    }
  });
}
