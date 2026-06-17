const quickRoomId = document.querySelector("#quickRoomId");
const quickRoomPassword = document.querySelector("#quickRoomPassword");
const quickRoomCopyButton = document.querySelector("#quickRoomCopyButton");
const quickPasswordCopyButton = document.querySelector("#quickPasswordCopyButton");
const roomCodeSource = document.querySelector("#roomCodeText");
const passwordSource = document.querySelector(".credential-box strong:last-child");
const sky = document.querySelector(".sky");

function syncQuickCredentials() {
  if (quickRoomId && roomCodeSource) quickRoomId.textContent = roomCodeSource.textContent.trim();
  if (quickRoomPassword && passwordSource) quickRoomPassword.textContent = passwordSource.textContent.trim();
}

function copyValue(value, fallbackLabel) {
  const text = value.trim();
  if (!text) return;

  navigator.clipboard?.writeText(text).catch(() => {});

  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = `${fallbackLabel} copied`;
  toast.classList.add("show");
  clearTimeout(copyValue.toastTimer);
  copyValue.toastTimer = setTimeout(() => toast.classList.remove("show"), 1700);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function setSkyValue(name, value) {
  sky.style.setProperty(name, value);
}

function randomPoint(range) {
  return `${randomBetween(-range, range).toFixed(1)}px ${randomBetween(-range, range).toFixed(1)}px`;
}

function shuffleStars() {
  if (!sky) return;

  setSkyValue("--stars-one-a", randomPoint(160));
  setSkyValue("--stars-one-b", randomPoint(220));
  setSkyValue("--stars-one-x", `${randomBetween(-26, 26).toFixed(1)}px`);
  setSkyValue("--stars-one-y", `${randomBetween(-22, 22).toFixed(1)}px`);
  setSkyValue("--stars-one-rotate", `${randomBetween(-4, 4).toFixed(2)}deg`);
  setSkyValue("--stars-one-scale", randomBetween(.96, 1.05).toFixed(3));
  setSkyValue("--stars-one-opacity", randomBetween(.21, .31).toFixed(3));
  setSkyValue("--stars-one-after-a", randomPoint(260));
  setSkyValue("--stars-one-after-b", randomPoint(300));
  setSkyValue("--stars-one-after-x", `${randomBetween(-42, 42).toFixed(1)}px`);
  setSkyValue("--stars-one-after-y", `${randomBetween(-42, 42).toFixed(1)}px`);
  setSkyValue("--stars-one-after-rotate", `${randomBetween(-7, 7).toFixed(2)}deg`);

  setSkyValue("--stars-two-a", randomPoint(190));
  setSkyValue("--stars-two-b", randomPoint(250));
  setSkyValue("--stars-two-x", `${randomBetween(-34, 34).toFixed(1)}px`);
  setSkyValue("--stars-two-y", `${randomBetween(-30, 30).toFixed(1)}px`);
  setSkyValue("--stars-two-rotate", `${randomBetween(2, 14).toFixed(2)}deg`);
  setSkyValue("--stars-two-scale", randomBetween(1.08, 1.22).toFixed(3));
  setSkyValue("--stars-two-opacity", randomBetween(.11, .19).toFixed(3));
  setSkyValue("--stars-two-after-a", randomPoint(280));
  setSkyValue("--stars-two-after-b", randomPoint(330));
  setSkyValue("--stars-two-after-x", `${randomBetween(-55, 55).toFixed(1)}px`);
  setSkyValue("--stars-two-after-y", `${randomBetween(-55, 55).toFixed(1)}px`);
  setSkyValue("--stars-two-after-rotate", `${randomBetween(-10, 10).toFixed(2)}deg`);
}

function animateButton(button) {
  button.classList.remove("soft-click");
  void button.offsetWidth;
  button.classList.add("soft-click");
  setTimeout(() => button.classList.remove("soft-click"), 450);
}

syncQuickCredentials();

[roomCodeSource, passwordSource].forEach((source) => {
  if (!source) return;
  new MutationObserver(syncQuickCredentials).observe(source, {
    childList: true,
    characterData: true,
    subtree: true,
  });
});

quickRoomCopyButton?.addEventListener("click", () => copyValue(quickRoomId?.textContent || "", "Room ID"));
quickPasswordCopyButton?.addEventListener("click", () => copyValue(quickRoomPassword?.textContent || "", "Password"));

document.addEventListener("click", (event) => {
  const button = event.target.closest("button, .ripple-button");
  if (button) animateButton(button);
  shuffleStars();
}, true);
