import { getDay, saveDay, dateKey } from "../shared/storage.js";
import { thoughtsToMap, getNode, progress } from "../shared/parse.js";

const nextBox = document.getElementById("nextBox");
const nextText = document.getElementById("nextText");
const sub = document.getElementById("sub");
const empty = document.getElementById("empty");
const quick = document.getElementById("quick");

let day = null;

async function init() {
  day = await getDay(dateKey());
  render();

  document.getElementById("openFull").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  document.getElementById("addThought").addEventListener("click", onAdd);
  quick.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAdd();
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
  day.map = thoughtsToMap(merged);
  day.mapped = day.map.nodes.length > 0;
  day = await saveDay(day);
  quick.value = "";
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
  } else if (day.mapped) {
    nextBox.hidden = true;
    empty.hidden = false;
    empty.textContent = "Map is clear — add another thought.";
  } else {
    nextBox.hidden = true;
    empty.hidden = false;
  }
}

init();
