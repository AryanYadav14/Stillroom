const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const landingView = $("#landingView");
const roomView = $("#roomView");
const joinModal = $("#joinModal");
const inviteModal = $("#inviteModal");
const soundModal = $("#soundModal");
const toast = $("#toast");
const timerDisplay = $("#timer");
const timerButton = $("#timerButton");
const timerState = $("#timerState");
const timerNote = $("#timerNote");

const API_BASE = "https://stillroom-of73.onrender.com";

let selectedMinutes = 50;
let timeRemaining = selectedMinutes * 60;
let timerInterval = null;
let syncInterval = null;
let isRunning = false;
let toastTimeout = null;
let roomCredentials = null;
let audioContext = null;
let rainSource = null;
let rainGain = null;
let musicUrl = null;
let renderedMessageId = null;
const seenEvents = new Set();
const clientId = sessionStorage.getItem("stillroom-client") || crypto.randomUUID();
sessionStorage.setItem("stillroom-client", clientId);

function showView(view) {
  $$(".view").forEach((item) => item.classList.remove("active"));
  view.classList.add("active");
}

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const input = modal.querySelector("input");
  if (input) setTimeout(() => input.focus(), 100);
}

function closeModals() {
  $$(".modal-backdrop").forEach((modal) => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove("show"), 2200);
}

function showActivity(event) {
  const note = document.createElement("div");
  note.className = `activity-note ${event.type === "leave" ? "leaving" : ""}`;
  note.innerHTML = `<strong>${escapeHtml(event.name)}</strong> ${event.type === "join" ? "entered the study room" : "left the study room"}`;
  $("#activityStack").appendChild(note);
  setTimeout(() => note.remove(), 4200);
}

async function request(endpoint, data = {}) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Could not connect to the room");
  }

  return result;
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(successMessage);
}

function updateTimerDisplay() {
  const minutes = Math.floor(timeRemaining / 60).toString().padStart(2, "0");
  const seconds = (timeRemaining % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${minutes}:${seconds}`;
  document.title = isRunning ? `${minutes}:${seconds} — Stillroom` : "Stillroom — Study together, quietly";
}

function setTimerButton(mode) {
  if (mode === "pause") {
    timerButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg><span>Pause together</span>';
    timerState.textContent = "Everyone is focusing";
    timerNote.textContent = "The room timer is running for everyone.";
  } else {
    timerButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7V5z" /></svg><span>Start together</span>';
    timerState.textContent = timeRemaining === selectedMinutes * 60 ? "Ready when you are" : "Session paused";
    timerNote.textContent = timeRemaining === selectedMinutes * 60 ? "Starting will begin the timer for everyone." : "Continue whenever everyone is ready.";
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]);
}

function renderPeople(people) {
  const colors = ["lavender", "blue", "rose", "green"];
  $("#onlineCount").textContent = `${people.length} online`;
  $("#peopleList").innerHTML = people.map((person, index) => {
    const name = escapeHtml(person.name);
    const subject = escapeHtml(person.subject);
    return `
    <li>
      <div class="person-avatar ${colors[index % colors.length]}">${name.charAt(0).toUpperCase()}</div>
      <div><strong>${name}</strong><span>${subject}</span></div>
      <i class="presence online"></i>
    </li>
  `;
  }).join("");
}

function renderMessages(messages) {
  const latestId = messages.at(-1)?.id || null;
  if (latestId === renderedMessageId) return;
  renderedMessageId = latestId;
  const container = $("#chatMessages");
  container.innerHTML = messages.length ? messages.map((message) => `
    <article class="chat-message ${message.clientId === clientId ? "mine" : ""}">
      <header><strong>${escapeHtml(message.name)}</strong><time>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></header>
      <p>${escapeHtml(message.text)}</p>
    </article>
  `).join("") : '<div class="chat-empty">Quiet for now. Say hello.</div>';
  container.scrollTop = container.scrollHeight;
}

function stopLocalTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function animateTimer() {
  stopLocalTimer();
  timerInterval = setInterval(() => {
    timeRemaining = Math.max(0, timeRemaining - 1);
    updateTimerDisplay();
    if (timeRemaining === 0) {
      stopLocalTimer();
      timerState.textContent = "Session complete";
      timerNote.textContent = "Beautiful work. Take a quiet breath.";
      showToast("Focus session complete");
    }
  }, 1000);
}

function applyRoomState(state, notify = true) {
  renderPeople(state.people);
  renderMessages(state.messages || []);
  (state.events || []).forEach((event) => {
    if (notify && !seenEvents.has(event.id) && event.name !== roomCredentials?.name) showActivity(event);
    seenEvents.add(event.id);
  });
  timeRemaining = state.timer.remaining;
  isRunning = state.timer.running;
  setTimerButton(isRunning ? "pause" : "start");
  updateTimerDisplay();
  if (isRunning && !timerInterval) animateTimer();
  if (!isRunning) stopLocalTimer();
}

async function syncRoom() {
  if (!roomCredentials) return;
  try {
    const state = await request(`/api/rooms/${roomCredentials.id}/heartbeat`, {
      ...roomCredentials,
      clientId,
      subject: "Studying",
    });
    applyRoomState(state);
  } catch {
    showToast("Trying to reconnect to the room");
  }
}

function enterRoom(credentials, state) {
  roomCredentials = credentials;
  $("#roomCodeText").textContent = credentials.id;
  $("#inviteRoomId").textContent = credentials.id;
  $(".credential-box strong:last-child").textContent = credentials.password;
  seenEvents.clear();
  (state.events || []).forEach((event) => seenEvents.add(event.id));
  applyRoomState(state, false);
  showView(roomView);
  clearInterval(syncInterval);
  syncInterval = setInterval(syncRoom, 4000);
  history.replaceState(null, "", "#room");
}

async function timerCommand(command, seconds) {
  if (!roomCredentials) return;
  try {
    const state = await request(`/api/rooms/${roomCredentials.id}/timer`, { ...roomCredentials, command, seconds });
    applyRoomState(state);
  } catch (error) {
    showToast(error.message);
  }
}

function leaveRoom(message) {
  if (roomCredentials) {
    fetch(`${API_BASE}/api/rooms/${roomCredentials.id}/leave`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...roomCredentials, clientId }),
      keepalive: true,
    }).catch(() => {});
  }
  stopLocalTimer();
  clearInterval(syncInterval);
  roomCredentials = null;
  showView(landingView);
  history.replaceState(null, "", location.pathname);
  if (message) showToast(message);
}

$("#createRoomButton").addEventListener("click", async () => {
  try {
    const created = await request("/api/rooms");
    const credentials = { ...created, name: "You" };
    const state = await request(`/api/rooms/${created.id}/join`, { ...credentials, clientId });
    enterRoom(credentials, state);
    showToast("Your study room is ready");
  } catch {
    showToast("Start the Stillroom server to create a room");
  }
});

$("#openJoinButton").addEventListener("click", () => openModal(joinModal));
$("#heroJoinButton").addEventListener("click", () => openModal(joinModal));
$("#inviteButton").addEventListener("click", () => openModal(inviteModal));
$("#soundButton").addEventListener("click", () => openModal(soundModal));
$("#copyRoomButton").addEventListener("click", () => copyText(`Room ID: ${roomCredentials.id}\nPassword: ${roomCredentials.password}`, "Room details copied"));
$("#roomCodeButton").addEventListener("click", () => copyText(roomCredentials.id, "Room ID copied"));
$("#copyInviteButton").addEventListener("click", () => copyText(`Join my Stillroom study session.\nRoom ID: ${roomCredentials.id}\nPassword: ${roomCredentials.password}`, "Invitation copied"));

$("#joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const credentials = {
    name: $("#nameInput").value.trim(),
    id: $("#roomInput").value.trim().toUpperCase(),
    password: $("#passwordInput").value.trim().toLowerCase(),
  };
  try {
    const state = await request(`/api/rooms/${credentials.id}/join`, { ...credentials, clientId });
    closeModals();
    enterRoom(credentials, state);
    showToast(`Welcome, ${credentials.name}`);
  } catch (error) {
    showToast(error.message);
  }
});

$("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = $("#chatInput");
  const text = input.value.trim();
  if (!text || !roomCredentials) return;
  input.value = "";
  try {
    const state = await request(`/api/rooms/${roomCredentials.id}/chat`, { ...roomCredentials, clientId, text });
    applyRoomState(state);
  } catch (error) {
    input.value = text;
    showToast(error.message);
  }
});

$$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
$$(".modal-backdrop").forEach((modal) => modal.addEventListener("click", (event) => {
  if (event.target === modal) closeModals();
}));
$("#brandHome").addEventListener("click", (event) => { event.preventDefault(); leaveRoom(); });
$("#leaveRoomButton").addEventListener("click", () => leaveRoom("You left the room"));

timerButton.addEventListener("click", () => timerCommand(isRunning ? "pause" : "start"));
$("#resetButton").addEventListener("click", () => {
  timerCommand("reset", selectedMinutes * 60);
  showToast("Timer reset for everyone");
});

$$(".duration[data-minutes]").forEach((button) => {
  button.addEventListener("click", () => {
    $$(".duration").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedMinutes = Number(button.dataset.minutes);
    timerCommand("reset", selectedMinutes * 60);
  });
});

$("#customDuration").addEventListener("click", () => {
  const minutes = Number(prompt("How many minutes would you like to focus?", "35"));
  if (Number.isInteger(minutes) && minutes > 0 && minutes <= 180) {
    $$(".duration").forEach((item) => item.classList.remove("active"));
    $("#customDuration").classList.add("active");
    $("#customDuration strong").textContent = minutes;
    selectedMinutes = minutes;
    timerCommand("reset", minutes * 60);
  } else if (minutes) showToast("Choose a duration from 1 to 180 minutes");
});

function setSoundLabel(label, active) {
  $("#soundButton").classList.toggle("active", active);
  $("#soundButton").setAttribute("aria-pressed", String(active));
  $("#soundButton span").textContent = label;
}

function stopRain() {
  if (rainSource) rainSource.stop();
  rainSource = null;
  $("#rainButton").classList.remove("playing");
  $("#rainStatus").textContent = "Play";
}

async function toggleRain() {
  if (rainSource) {
    stopRain();
    setSoundLabel("Soundscape", !$("#musicPlayer").paused);
    return;
  }
  $("#musicPlayer").pause();
  audioContext ||= new AudioContext();
  await audioContext.resume();
  const length = audioContext.sampleRate * 3;
  const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.025 * white) / 1.025;
    data[index] = last * 3.2;
  }
  rainSource = audioContext.createBufferSource();
  rainGain = audioContext.createGain();
  const filter = audioContext.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  rainSource.buffer = buffer;
  rainSource.loop = true;
  rainGain.gain.value = Number($("#volumeSlider").value) / 100;
  rainSource.connect(filter).connect(rainGain).connect(audioContext.destination);
  rainSource.start();
  $("#rainButton").classList.add("playing");
  $("#rainStatus").textContent = "Pause";
  setSoundLabel("Soft rain", true);
}

$("#rainButton").addEventListener("click", toggleRain);
$("#musicUpload").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  stopRain();
  if (musicUrl) URL.revokeObjectURL(musicUrl);
  musicUrl = URL.createObjectURL(file);
  const player = $("#musicPlayer");
  player.src = musicUrl;
  player.volume = Number($("#volumeSlider").value) / 100;
  player.play();
  $("#musicName").textContent = file.name;
  setSoundLabel(file.name.slice(0, 16), true);
});
$("#volumeSlider").addEventListener("input", (event) => {
  const volume = Number(event.target.value) / 100;
  $("#musicPlayer").volume = volume;
  if (rainGain) rainGain.gain.value = volume;
});
$("#stopAudioButton").addEventListener("click", () => {
  stopRain();
  $("#musicPlayer").pause();
  setSoundLabel("Soundscape", false);
});
$("#musicPlayer").addEventListener("play", () => setSoundLabel($("#musicName").textContent.slice(0, 16), true));

document.addEventListener("click", (event) => {
  const target = event.target.closest("button, .ripple-button");
  if (!target || target.classList.contains("modal-close")) return;
  const rect = target.getBoundingClientRect();
  const ripple = document.createElement("span");
  const size = Math.max(rect.width, rect.height);
  ripple.className = "click-ripple";
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
  target.appendChild(ripple);
  setTimeout(() => ripple.remove(), 700);
});

const savedGoal = localStorage.getItem("stillroom-goal");
if (savedGoal) $("#goalInput").value = savedGoal;
$("#goalInput").addEventListener("input", (event) => localStorage.setItem("stillroom-goal", event.target.value));
$("#goalCheck").addEventListener("click", (event) => {
  event.currentTarget.classList.toggle("done");
  showToast(event.currentTarget.classList.contains("done") ? "Intention completed" : "Intention reopened");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModals();
  if (event.code === "Space" && roomView.classList.contains("active") && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    timerCommand(isRunning ? "pause" : "start");
  }
});
window.addEventListener("pagehide", () => {
  if (!roomCredentials) return;
  fetch(`/api/rooms/${roomCredentials.id}/leave`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...roomCredentials, clientId }),
    keepalive: true,
  });
});

if (location.hash === "#room") history.replaceState(null, "", location.pathname);
updateTimerDisplay();
