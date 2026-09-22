import { getDay, saveDay, dateKey, todayStorageKey } from "../shared/storage.js";
import { remapThoughts, getNode, pickNextStep, focusLoad, capWarning, removeNode } from "../shared/parse.js";
import { decisionReason } from "../shared/priority.js";
import { createVoiceCapture } from "../shared/voice.js";

const nextBox = document.getElementById("nextBox");
const nextText = document.getElementById("nextText");
const nextHint = document.getElementById("nextHint");
const sub = document.getElementById("sub");
const empty = document.getElementById("empty");
const quick = document.getElementById("quick");
const markDoneBtn = document.getElementById("markDone");

let day = null;
let applyingRemote = false;

async function init() {
  day = await getDay(dateKey());
  render();

  document.getElementById("openMap").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });
  document.getElementById("openCapture").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html?focus=capture") });
  });
  document.getElementById("addThought").addEventListener("click", onAdd);
  markDoneBtn.addEventListener("click", onMarkDone);
  document.getElementById("markReward").addEventListener("click", onReward);
  document.getElementById("deleteNode").addEventListener("click", onDelete);
  createVoiceCapture({
    button: document.getElementById("voiceDump"),
    input: quick,
    onText: () => {
      document.getElementById("voiceStatus").textContent = "";
    },
    onError: (message) => {
      document.getElementById("voiceStatus").textContent = message;
    },
  });
  quick.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      onAdd();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || applyingRemote) return;
    if (!changes[todayStorageKey()]) return;
    const next = changes[todayStorageKey()].newValue;
    if (!next) return;
    day = next;
    render();
  });
}

async function onAdd() {
  const bit = quick.value.trim();
  if (!bit) {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html?focus=capture") });
    return;
  }
  const merged = day.thoughts ? `${day.thoughts.trim()}\n${bit}` : bit;
  day.thoughts = merged;
  day.map = remapThoughts(merged, day.map);
  day.mapped = day.map.nodes.length > 0;
  applyingRemote = true;
  day = await saveDay(day);
  applyingRemote = false;
  quick.value = "";
  render();
}

async function onMarkDone() {
  const id = day.map?.nextStepId;
  if (!id) return;
  const node = day.map.nodes.find((n) => n.id === id);
  if (!node) return;
  const turningDone = !node.done;
  node.done = !node.done;
  day.map.nextStepId = pickNextStep(day.map.nodes);
  if (turningDone) nextBox.classList.add("is-celebrating");
  applyingRemote = true;
  day = await saveDay(day);
  applyingRemote = false;
  render();
}

async function onDelete() {
  const id = day.map?.nextStepId;
  if (!id) return;
  const node = day.map.nodes.find((item) => item.id === id);
  if (!node) return;
  const label = node.full || node.label;
  if (!confirm(`Delete “${label}”?`)) return;
  removeNode(day.map, id);
  day.thoughts = (day.map.nodes || []).map((item) => item.full || item.label).filter(Boolean).join("\n");
  day.mapped = day.map.nodes.length > 0;
  applyingRemote = true;
  day = await saveDay(day);
  applyingRemote = false;
  render();
}

async function onReward() {
  const id = day.map?.nextStepId;
  if (!id) return;
  const node = day.map.nodes.find((item) => item.id === id);
  if (!node) return;
  node.reward = !node.reward;
  nextBox.classList.add("is-celebrating");
  applyingRemote = true;
  day = await saveDay(day);
  applyingRemote = false;
  render();
}

function render() {
  const load = focusLoad(day.map?.nodes);
  const warning = capWarning(load);
  const capNote = document.getElementById("capNote");
  sub.textContent = load.open
    ? load.over > 0
      ? `Over cap · ${load.open}/${load.cap} focus`
      : `${load.open}/${load.cap} focus · today`
    : "Dump thoughts → see the map";
  capNote.hidden = !warning;
  capNote.textContent = warning;

  const next = getNode(day.map, day.map?.nextStepId);
  const rewardBtn = document.getElementById("markReward");
  if (next) {
    nextBox.hidden = false;
    empty.hidden = true;
    nextBox.dataset.type = next.type;
    nextText.textContent = next.full || next.label;
    nextHint.textContent = decisionReason(next, load);
    markDoneBtn.disabled = false;
    markDoneBtn.textContent = next.done ? "Mark open" : "Mark done";
    rewardBtn.disabled = false;
    rewardBtn.textContent = next.reward ? "Rewarded" : "Reward";
    document.getElementById("deleteNode").disabled = false;
    if (nextBox.classList.contains("is-celebrating")) {
      window.setTimeout(() => nextBox.classList.remove("is-celebrating"), 700);
    }
  } else if (day.mapped) {
    nextBox.hidden = true;
    empty.hidden = false;
    empty.textContent = "Map is clear — add another thought.";
    markDoneBtn.disabled = true;
    rewardBtn.disabled = true;
    document.getElementById("deleteNode").disabled = true;
  } else {
    nextBox.hidden = true;
    empty.hidden = false;
    empty.textContent = "No map yet — capture a thought below.";
    markDoneBtn.disabled = true;
    document.getElementById("markReward").disabled = true;
    document.getElementById("deleteNode").disabled = true;
  }
}

init();
