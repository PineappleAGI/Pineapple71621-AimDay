import { getDay, saveDay, dateKey, todayStorageKey } from "../shared/storage.js";
import { remapThoughts, getNode, progress, pickNextStep } from "../shared/parse.js";

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
  node.done = !node.done;
  day.map.nextStepId = pickNextStep(day.map.nodes);
  applyingRemote = true;
  day = await saveDay(day);
  applyingRemote = false;
  render();
}

function render() {
  const { done, total } = progress(day.map);
  sub.textContent = total ? `${done}/${total} moves done · today` : "Dump thoughts → see the map";

  const next = getNode(day.map, day.map?.nextStepId);
  if (next) {
    nextBox.hidden = false;
    empty.hidden = true;
    nextText.textContent = next.full || next.label;
    nextHint.textContent =
      next.type === "blocker" ? "Unblock this first" : next.type === "action" ? "Clearest next action" : "Worth focusing here";
    markDoneBtn.disabled = false;
    markDoneBtn.textContent = next.done ? "Mark open" : "Mark done";
  } else if (day.mapped) {
    nextBox.hidden = true;
    empty.hidden = false;
    empty.textContent = "Map is clear — add another thought.";
    markDoneBtn.disabled = true;
  } else {
    nextBox.hidden = true;
    empty.hidden = false;
    empty.textContent = "No map yet — capture a thought below.";
    markDoneBtn.disabled = true;
  }
}

init();
