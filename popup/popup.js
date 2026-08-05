import { getDay, dateKey, todayStorageKey } from "../shared/storage.js";
import { getNode, progress } from "../shared/parse.js";

const nextBox = document.getElementById("nextBox");
const nextText = document.getElementById("nextText");
const sub = document.getElementById("sub");
const empty = document.getElementById("empty");

let day = null;

async function init() {
  day = await getDay(dateKey());
  render();

  document.getElementById("openFull").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
  });

  document.getElementById("openPanel").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "open-side-panel" });
    window.close();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[todayStorageKey()]) return;
    const next = changes[todayStorageKey()].newValue;
    if (!next) return;
    day = next;
    render();
  });
}

function render() {
  const { done, total } = progress(day.map);
  sub.textContent = total ? `${done}/${total} moves done · today` : "Open the side panel to capture";

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
