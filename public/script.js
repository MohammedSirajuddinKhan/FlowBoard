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
const bossCrewList = document.getElementById("bossCrewList");
const riderCrewList = document.getElementById("riderCrewList");
const watcherCrewList = document.getElementById("watcherCrewList");
const bossCount = document.getElementById("bossCount");
const riderCount = document.getElementById("riderCount");
const watcherCount = document.getElementById("watcherCount");
const inviteCode = document.getElementById("inviteCode");
const inviteLink = document.getElementById("inviteLink");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const memberTotal = document.getElementById("memberTotal");
const currentRoleLabel = document.getElementById("currentRoleLabel");
const crewRoomName = document.getElementById("crewRoomName");
const livePresence = document.getElementById("livePresence");
const realtimeToast = document.getElementById("realtimeToast");

const flowboardState = window.__FLOWBOARD__ || {};
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
    const response = await fetch(getTaskApiBase());
    if (!response.ok) throw new Error("Failed to load tasks");
    allTasks = await response.json();
    renderTasks();
  } catch (error) {
    console.error("Load tasks error:", error);
    alert("Failed to load tasks. Please refresh the page.");
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

  if (inviteCode && roomContext?.roomCode) {
    inviteCode.textContent = roomContext.roomCode;
  }

  if (inviteLink) {
    inviteLink.value = getInviteLink();
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
  livePresence.textContent = `Live ${count}`;
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

function getMemberInitials(email) {
  const source = String(email || "user");
  const localPart = source.includes("@") ? source.split("@")[0] : source;
  const parts = localPart
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return "FB";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function setCrewStatus(message, isError = false) {
  if (!crewStatus) return;

  crewStatus.textContent = message;
  crewStatus.classList.toggle("error", Boolean(isError));
}

function groupMembersByRole() {
  return {
    boss: roomMembers.filter((member) => member.role === "boss"),
    rider: roomMembers.filter((member) => member.role === "rider"),
    watcher: roomMembers.filter((member) => member.role === "watcher"),
  };
}

function getNonBossMembers() {
  return roomMembers.filter((member) => member.role !== "boss");
}

function renderCrewModal() {
  if (!crewModal) return;

  const groups = groupMembersByRole();
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

  bossCount.textContent = String(groups.boss.length);
  riderCount.textContent = String(groups.rider.length);
  watcherCount.textContent = String(groups.watcher.length);

  renderCrewList(bossCrewList, groups.boss, true);
  renderCrewList(riderCrewList, groups.rider, false);
  renderCrewList(watcherCrewList, groups.watcher, false);

  if (deployCrewBtn) {
    deployCrewBtn.disabled = currentRoomRole !== "boss";
    deployCrewBtn.textContent =
      currentRoomRole === "boss" ? "Deploy Changes" : "Read Only";
  }
}

function renderCrewList(container, members, isBossGroup) {
  if (!container) return;

  if (!members.length) {
    container.innerHTML =
      '<div class="crew-empty">No members in this group.</div>';
    return;
  }

  container.innerHTML = members
    .map((member) => createCrewMemberMarkup(member, isBossGroup))
    .join("");

  members.forEach((member) => {
    const root = container.querySelector(`[data-member-id="${member.id}"]`);
    if (!root) return;

    const riderToggle = root.querySelector(`[data-role-toggle="rider"]`);
    const watcherToggle = root.querySelector(`[data-role-toggle="watcher"]`);
    const removeBtn = root.querySelector(`[data-action="remove"]`);
    const handoverBtn = root.querySelector(`[data-action="handover"]`);

    if (isBossGroup) {
      if (riderToggle) riderToggle.disabled = true;
      if (watcherToggle) watcherToggle.disabled = true;
      if (removeBtn) removeBtn.remove();
      if (handoverBtn) handoverBtn.remove();
      return;
    }

    const initialRole = crewDraftRoles.get(member.id) || member.role;
    if (riderToggle && watcherToggle) {
      riderToggle.checked = initialRole === "rider";
      watcherToggle.checked = initialRole !== "rider";

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

    if (removeBtn) {
      removeBtn.addEventListener("click", () => removeCrewMember(member));
    }

    if (handoverBtn) {
      handoverBtn.addEventListener("click", () => handoverCrewRole(member));
    }
  });
}

function createCrewMemberMarkup(member, isBossGroup) {
  const email = escapeHtml(member.user?.email || "member@flowboard");
  const roleClass = `role-${member.role}`;
  const roleLabel = escapeHtml(member.roleLabel || getRoleLabel(member.role));
  const initials = escapeHtml(getMemberInitials(member.user?.email));
  const isBoss = member.role === "boss" || isBossGroup;
  const disabledAttr = currentRoomRole !== "boss" ? "disabled" : "";
  const currentSelection = crewDraftRoles.get(member.id) || member.role;

  return `
    <article class="crew-member" data-member-id="${member.id}">
      <div class="crew-avatar">${initials}</div>
      <div class="crew-member-main">
        <div class="crew-member-top">
          <strong>${email}</strong>
          <span class="crew-role-badge ${roleClass}">${roleLabel}</span>
        </div>
        <div class="crew-powers">
          <div class="crew-toggle-row crew-toggle-rider">
            <label>
              <input type="checkbox" data-role-toggle="rider" ${currentSelection === "rider" ? "checked" : ""} ${isBoss ? "disabled" : disabledAttr} />
              Rider
            </label>
          </div>
          <div class="crew-toggle-row crew-toggle-watcher">
            <label>
              <input type="checkbox" data-role-toggle="watcher" ${currentSelection === "watcher" ? "checked" : ""} ${isBoss ? "disabled" : disabledAttr} />
              Watcher
            </label>
          </div>
        </div>
        ${
          currentRoomRole === "boss" && !isBoss
            ? `
        <div class="crew-actions">
          <button type="button" class="crew-action-btn crew-action-remove" data-action="remove">Remove</button>
          <button type="button" class="crew-action-btn crew-action-handover" data-action="handover">Handover</button>
        </div>
        `
            : ""
        }
      </div>
    </article>
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

async function removeCrewMember(member) {
  if (currentRoomRole !== "boss") {
    setCrewStatus("Only the Flow Boss can remove members.", true);
    return;
  }

  if (!confirm(`Remove ${member.user?.email || "this member"} from the room?`))
    return;

  try {
    const response = await fetch(
      `/api/rooms/${roomContext.roomCode}/crew/${member.id}`,
      {
        method: "DELETE",
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to remove member");
    }

    roomMembers = Array.isArray(data.members) ? data.members : [];
    crewDraftRoles = new Map(
      roomMembers
        .filter((entry) => entry.role !== "boss")
        .map((entry) => [entry.id, entry.role]),
    );
    renderCrewModal();
    setCrewStatus("Member removed.", false);
  } catch (error) {
    console.error("Remove crew member error:", error);
    setCrewStatus(error.message || "Failed to remove member.", true);
  }
}

async function handoverCrewRole(member) {
  if (currentRoomRole !== "boss") {
    setCrewStatus("Only the Flow Boss can hand over ownership.", true);
    return;
  }

  if (
    !confirm(`Hand over Flow Boss to ${member.user?.email || "this member"}?`)
  )
    return;

  try {
    const response = await fetch(
      `/api/rooms/${roomContext.roomCode}/handover`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: member.id }),
      },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to hand over ownership");
    }

    roomMembers = Array.isArray(data.members) ? data.members : [];
    crewDraftRoles = new Map(
      roomMembers
        .filter((entry) => entry.role !== "boss")
        .map((entry) => [entry.id, entry.role]),
    );
    currentRoomRole = "rider";
    updateRoomBadge();
    renderCrewModal();
    setCrewStatus("Flow Boss handover complete.", false);
  } catch (error) {
    console.error("Handover crew role error:", error);
    setCrewStatus(error.message || "Failed to hand over ownership.", true);
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
      container.appendChild(taskEl);
    });

    // Update count
    const count = container.parentElement.querySelector(".count");
    count.textContent = tasks.length;
  });

  // Reattach drag listeners
  attachDragListeners();
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
      <span class="task-column-icon" aria-hidden="true">${getTaskColumnIcon(task.column)}</span>
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
  if (column === "todo") return "💡";
  if (column === "progress") return "⏳";
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

    renderTasks();
  } catch (error) {
    console.error("Update task position error:", error);
    alert("Failed to update task position. Please refresh the page.");
  }
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
