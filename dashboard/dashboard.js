import { getDay, saveDay, getSettings, saveSettings, dateKey, emptyDay, todayStorageKey, getRecentDays } from "../shared/storage.js";
import {
  remapThoughts,
  getNode,
  pickNextStep,
  removeNode,
  progress,
  typeCounts,
  pathToNode,
  shorten,
  explainNext,
  focusLoad,
  capWarning,
  annotateNode,
  applyNodeType,
  resolveStacks,
} from "../shared/parse.js";
import { layoutMindmap, nodeBox } from "../shared/layout.js";
import { escapeHtml, thoughtKey } from "../shared/util.js";
import { typeLabel, colorsFor, TYPE_ORDER, TYPE_LABELS } from "../shared/kinds.js";
import { formatClock, replaceTime, clearTime, snapMinutes } from "../shared/signals.js";
import { decisionReason } from "../shared/priority.js";
import { createVoiceCapture } from "../shared/voice.js";
import { rollupWeek } from "../shared/review.js";

const state = {
  day: null,
  settings: null,
  step: "capture",
  selectedId: null,
  view: { x: 0, y: 0, scale: 1 },
  layout: null,
  dragging: false,
  lastPtr: null,
  nodeDrag: null,
  focusMode: false,
  showReview: false,
  applyingRemote: false,
  contextFilter: "all",
  showSomeday: false,
  celebrateId: null,
  returnStep: "capture",
  voice: null,
};

const DAY_START = 7 * 60;
const DAY_END = 21 * 60;

const DRAG_THRESHOLD = 6;

const $ = (sel, root = document) => root.querySelector(sel);

async function init() {
  state.settings = await getSettings();
  state.day = await getDay(dateKey());

  const params = new URLSearchParams(location.search);
  if (params.get("focus") === "capture") {
    state.step = "capture";
  } else if (state.day.mapped && state.day.map?.nodes?.length) {
    state.step = "map";
    state.selectedId = state.day.map.nextStepId;
  }

  bind();
  $("#openOnStartup").checked = !!state.settings.openOnStartup;
  $("#morningNotify").checked = !!state.settings.morningNotify;
  renderLegend();
  render();

  if (params.get("focus") === "capture") {
    requestAnimationFrame(() => $("#thoughts")?.focus());
  }
}

function backToDump() {
  state.step = "capture";
  state.showReview = false;
  state.focusMode = false;
  render();
  requestAnimationFrame(() => {
    const thoughts = $("#thoughts");
    thoughts?.focus();
    window.scrollTo(0, 0);
  });
}

function bind() {
  $("#thoughtForm").addEventListener("submit", onMapThoughts);
  $("#remap").addEventListener("click", backToDump);
  $("#backToDump").addEventListener("click", backToDump);
  $("#resetDay").addEventListener("click", onReset);
  $("#markDone").addEventListener("click", onMarkDone);
  $("#topPrimary").addEventListener("click", onMarkDone);
  $("#markOpen").addEventListener("click", () => onMarkOpen(state.selectedId));
  $("#markReward").addEventListener("click", onReward);
  $("#parkNode").addEventListener("click", onPark);
  $("#openBranch").addEventListener("click", onOpenBranch);
  $("#pinNext").addEventListener("click", onPinNext);
  $("#deleteNode").addEventListener("click", () => onDeleteNode(state.day.map?.nextStepId));
  $("#deleteSelected").addEventListener("click", () => onDeleteNode(state.selectedId));
  $("#openWeek").addEventListener("click", onOpenWeek);
  $("#closeWeek").addEventListener("click", () => {
    const back = state.returnStep === "week" ? (state.day.mapped ? "map" : "capture") : state.returnStep;
    state.step = back || "capture";
    render();
  });
  $("#thoughts").addEventListener("input", syncGhost);
  state.voice = createVoiceCapture({
    button: $("#voiceDump"),
    input: $("#thoughts"),
    onText: () => {
      $("#voiceStatus").textContent = "";
      syncGhost();
    },
    onError: (message) => {
      $("#voiceStatus").textContent = message;
    },
  });
  $("#filterRow").addEventListener("click", onFilterClick);
  $("#toggleSomeday").addEventListener("click", () => {
    state.showSomeday = !state.showSomeday;
    $("#toggleSomeday").classList.toggle("is-on", state.showSomeday);
    $("#toggleSomeday").setAttribute("aria-pressed", state.showSomeday ? "true" : "false");
    renderMap();
  });
  $("#priorityMatrix").addEventListener("click", onPriorityClick);
  $("#timeline").addEventListener("pointerdown", onTimelinePointerDown);
  $("#toggleFocus").addEventListener("click", () => {
    state.focusMode = !state.focusMode;
    renderMap();
    renderChrome();
  });
  $("#focusNode").addEventListener("click", () => {
    const id = focusedNodeId();
    if (id) {
      state.selectedId = id;
      state.focusMode = true;
      centerOn(id);
      renderMap();
      renderNext();
      renderChrome();
    }
  });
  $("#toggleReview").addEventListener("click", () => {
    state.showReview = !state.showReview;
    renderReview();
  });
  $("#closeReview").addEventListener("click", () => {
    state.showReview = false;
    renderReview();
  });
  $("#applyEdit").addEventListener("click", onApplyEdit);
  $("#openOnStartup").addEventListener("change", async () => {
    state.settings = await saveSettings({ openOnStartup: $("#openOnStartup").checked });
  });
  $("#morningNotify").addEventListener("change", async () => {
    state.settings = await saveSettings({ morningNotify: $("#morningNotify").checked });
  });
  $("#zoomIn").addEventListener("click", () => zoomBy(1.15));
  $("#zoomOut").addEventListener("click", () => zoomBy(1 / 1.15));
  $("#zoomReset").addEventListener("click", resetView);

  const wrap = $("#canvasWrap");
  wrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  wrap.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("keydown", onKeyDown);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || state.applyingRemote) return;
    const dayChange = changes[todayStorageKey()];
    if (!dayChange?.newValue) return;
    const remote = dayChange.newValue;
    if (remote.updatedAt && state.day?.updatedAt && remote.updatedAt <= state.day.updatedAt) return;
    state.day = remote;
    if (state.day.mapped && state.day.map?.nodes?.length && state.step === "capture") {
      // stay on capture if user is editing thoughts
    } else if (state.day.mapped && state.day.map?.nodes?.length) {
      state.step = "map";
      if (!state.selectedId) state.selectedId = state.day.map.nextStepId;
    }
    render();
  });
}

async function onMapThoughts(e) {
  e.preventDefault();
  state.voice?.stop();
  const raw = $("#thoughts").value.trim();
  if (!raw) return;

  const map = remapThoughts(raw, state.day.map);
  state.day.thoughts = raw;
  state.day.map = map;
  state.day.mapped = map.nodes.length > 0;
  state.selectedId = map.nextStepId;
  state.showReview = true;
  await persist();
  state.step = "map";
  state.view = { x: 0, y: 0, scale: 1 };
  render();
  requestAnimationFrame(() => {
    if (map.nextStepId) centerOn(map.nextStepId);
  });
}

async function onReset() {
  if (!confirm("Clear today’s thoughts and map?")) return;
  state.day = emptyDay(dateKey());
  await persist();
  state.step = "capture";
  state.selectedId = null;
  state.focusMode = false;
  state.showReview = false;
  render();
}

async function onMarkDone() {
  const map = state.day.map;
  let id = state.selectedId || map?.nextStepId;
  if (id === map?.root?.id) id = nodeForRoot(map)?.id || id;
  if (!id) return;
  if (id === map.root?.id) {
    const turningDone = !map.root.done;
    map.root.done = turningDone;
    if (turningDone) state.celebrateId = id;
    await persist();
    renderMap();
    renderNext();
    renderEdit();
    renderChrome();
    renderReview();
    if (turningDone) releaseCelebration(id);
    return;
  }
  const node = map.nodes.find((n) => n.id === id);
  if (!node) return;
  const turningDone = !node.done;
  node.done = !node.done;
  if (turningDone) state.celebrateId = node.id;
  map.nextStepId = pickNextStep(map.nodes);
  state.selectedId = map.nextStepId;
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderChrome();
  renderReview();
  if (turningDone) releaseCelebration(id);
}

function nodeForRoot(map) {
  const label = String(map?.root?.label || "").trim().toLowerCase();
  if (!label || label === "my focus") return null;
  const nodes = map?.nodes || [];
  return (
    nodes.find((node) => String(node.label || "").trim().toLowerCase() === label) ||
    nodes.find((node) => String(node.full || node.label || "").trim().toLowerCase().endsWith(label)) ||
    null
  );
}

function doneTarget() {
  const map = state.day.map;
  if (!map) return null;
  if (state.selectedId === map.root?.id) return nodeForRoot(map) || map.root;
  if (state.selectedId) return getNode(map, state.selectedId);
  return getNode(map, map.nextStepId);
}

async function onMarkOpen(id) {
  const map = state.day.map;
  if (id === map?.root?.id) id = nodeForRoot(map)?.id || id;
  if (id === map?.root?.id) {
    map.root.done = false;
    state.selectedId = id;
    await persist();
    renderMap();
    renderNext();
    renderEdit();
    renderChrome();
    renderReview();
    return;
  }
  const node = map?.nodes?.find((item) => item.id === id);
  if (!node || !node.done || id === state.day.map?.root?.id) return;
  node.done = false;
  state.selectedId = id;
  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderChrome();
  renderReview();
}

async function onDeleteNode(id) {
  if (!id || id === state.day.map?.root?.id) return;
  const node = state.day.map.nodes.find((item) => item.id === id);
  if (!node) return;
  const label = node.full || node.label;
  if (!confirm(`Delete “${label}”?`)) return;

  removeNode(state.day.map, id);
  state.selectedId = state.day.map.nextStepId;
  syncThoughtsFromNodes();
  state.day.mapped = state.day.map.nodes.length > 0;
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderReview();
  renderChrome();
}

async function onPinNext() {
  const id = state.selectedId;
  if (!id || id === state.day.map.root?.id) return;
  const node = getNode(state.day.map, id);
  if (!node || node.done) return;
  state.day.map.nextStepId = id;
  await persist();
  renderMap();
  renderNext();
  renderChrome();
}

async function onApplyEdit() {
  const id = state.selectedId;
  if (!id || id === state.day.map.root?.id) return;
  const node = state.day.map.nodes.find((n) => n.id === id);
  if (!node) return;

  const label = $("#editLabel").value.trim();
  const type = $("#editType").value;
  const parentVal = $("#editParent").value;

  if (label) {
    node.full = label;
    node.label = shorten(label, 72);
  }
  applyNodeType(node, type);
  applyEditMeta(node);

  if (parentVal === "root") {
    node.parentId = state.day.map.root.id;
    node.manualParent = "root";
  } else if (parentVal && parentVal !== id && !descendantIds(state.day.map, id).has(parentVal)) {
    node.parentId = parentVal;
    const parent = getNode(state.day.map, parentVal);
    node.manualParent = parent?.full || parent?.label || "root";
  }

  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);

  syncThoughtsFromNodes();
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderReview();
  renderChrome();
}

function syncThoughtsFromNodes() {
  const lines = (state.day.map.nodes || []).map((n) => n.full || n.label).filter(Boolean);
  state.day.thoughts = lines.join("\n");
}

async function persist() {
  state.applyingRemote = true;
  state.day = await saveDay(state.day);
  state.applyingRemote = false;
}

function render() {
  $("#panel-capture").hidden = state.step !== "capture";
  $("#panel-map").hidden = state.step !== "map";
  $("#panel-week").hidden = state.step !== "week";

  if (state.step === "capture") {
    $("#thoughts").value = state.day.thoughts || "";
    $("#mapBtn").textContent = state.day.mapped ? "Update map" : "Map my thoughts";
    syncGhost();
  }
  if (state.step === "map") {
    renderMap();
    renderNext();
    renderEdit();
    renderReview();
  }
  renderChrome();
}

function renderChrome() {
  const d = new Date();
  $("#datePill").textContent = `Today · ${d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })}`;

  const load = focusLoad(state.day.map?.nodes);
  const progressPill = $("#progressPill");
  const statusPill = $("#statusPill");
  const topPrimary = $("#topPrimary");
  const toggleFocus = $("#toggleFocus");

  if (state.step === "map") {
    progressPill.hidden = false;
    progressPill.classList.toggle("warn", load.over > 0);
    progressPill.textContent = load.over > 0 ? `Over cap · ${load.open}/${load.cap}` : `${load.open}/${load.cap} focus`;
    statusPill.textContent = state.focusMode ? "Must" : "Mapped";
  } else if (state.step === "capture") {
    progressPill.hidden = true;
    progressPill.classList.remove("warn");
    statusPill.textContent = state.day.mapped ? "Editing dump" : "Ready";
  } else if (state.step === "week") {
    progressPill.hidden = true;
    progressPill.classList.remove("warn");
    statusPill.textContent = "Week review";
  } else {
    progressPill.hidden = true;
    progressPill.classList.remove("warn");
    statusPill.textContent = "Mapped";
  }

  const onMap = state.step === "map";
  $("#backToDump").hidden = !onMap;
  toggleFocus.hidden = !onMap;
  toggleFocus.classList.toggle("primary", state.focusMode);
  toggleFocus.textContent = state.focusMode ? "Exit focus" : "Focus";
  topPrimary.hidden = !onMap || !state.day.map?.nextStepId;
  const next = doneTarget() || getNode(state.day.map, state.day.map?.nextStepId);
  if (next) topPrimary.textContent = next.done ? "Mark open" : "Mark done";

  $("#canvasWrap")?.classList.toggle("is-focus", state.focusMode);
  const banner = $("#canvasBanner");
  if (banner) {
    banner.hidden = !(onMap && state.focusMode);
    if (onMap && state.focusMode) {
      const count = mustIds(state.day.map).size;
      banner.textContent = count ? `Must · ${count}` : "No Must tasks";
    }
  }
}

function renderNext() {
  const map = state.day.map;
  const next = getNode(map, map.nextStepId);
  const selected = getNode(map, state.selectedId) || next;
  const counts = typeCounts(map);
  const { done, total } = progress(map);

  const meters = $("#meters");
  if (map.nodes?.length) {
    meters.hidden = false;
    const actionDone = (map.nodes || []).filter((n) => n.type === "action" && n.done).length;
    $("#meterActions").style.width = `${Math.round((actionDone / Math.max(counts.action, 1)) * 100)}%`;
    $("#meterBlockers").style.width = counts.blocker
      ? `${Math.round((((map.nodes || []).filter((n) => n.type === "blocker" && n.done).length) / counts.blocker) * 100)}%`
      : "0%";
    $("#meterGoals").style.width = `${Math.min(100, (counts.goal + counts.theme) * 20)}%`;
  } else {
    meters.hidden = true;
  }

  const load = focusLoad(map.nodes);
  const warning = capWarning(load);
  const capNote = $("#capNote");
  capNote.hidden = !warning;
  capNote.textContent = warning;

  if (!next) {
    $("#nextTitle").textContent = map.nodes?.length ? "All clear — map again or add more" : "No steps yet";
    $("#nextHint").textContent = "Dump more thoughts to find a next move.";
    $("#decisionText").textContent = total ? `${done}/${total} moves complete.` : "Map your thoughts to begin.";
    $("#markDone").disabled = true;
    $("#markReward").disabled = true;
    $("#pinNext").disabled = true;
    $("#deleteNode").disabled = true;
    return;
  }

  $("#markDone").disabled = false;
  $("#deleteNode").disabled = false;
  $("#markReward").disabled = !selected || selected.type === "root";
  $("#markReward").textContent = selected?.reward ? "Rewarded" : "Reward";
  $("#pinNext").disabled = !selected || selected.type === "root" || selected.done;
  $("#nextTitle").textContent = next.full || next.label;
  $("#nextHint").textContent = decisionReason(next, load);
  $("#markDone").textContent = (doneTarget() || next)?.done ? "Mark open" : "Mark done";

  const filterNote = state.contextFilter === "all" ? "" : ` Showing ${state.contextFilter}.`;
  if (selected?.type === "root") {
    const centerDone = !!(nodeForRoot(map)?.done || map.root?.done);
    $("#decisionText").textContent = centerDone
      ? `Center task is done. Mark it open to bring it back.${filterNote}`
      : `Mark the center task done the same way as the others.${filterNote}`;
    $("#markDone").disabled = false;
    $("#markDone").textContent = centerDone ? "Mark open" : "Mark done";
  } else if (selected && selected.id !== next.id && selected.type !== "root") {
    $("#decisionText").textContent = selected.done
      ? `“${selected.label}” is done. Mark it open to bring it back.${filterNote}`
      : `Selected “${selected.label}” (${typeLabel(selected.type)}). Pin it, edit it, delete it, or keep the suggested next step.${filterNote}`;
  } else {
    $("#decisionText").textContent = `Do this next, then mark it done or delete it. ${done}/${total || 0} moves complete.${filterNote}`;
  }
}

function renderEdit() {
  const box = $("#editBox");
  const map = state.day.map;
  const node = getNode(map, state.selectedId);
  if (!node || node.type === "root" || state.step !== "map") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  $("#markOpen").hidden = !node.done;
  $("#editLabel").value = node.full || node.label;
  $("#editType").value = TYPE_ORDER.includes(node.type) ? node.type : "note";
  paintMatrix(node);
  $("#editTime").value = minutesToInput(node.timeMinutes);
  $("#editContext").value = node.context || "";
  $("#editIdentity").value = node.identity || "";
  $("#identityField").hidden = !(node.type === "goal" || node.type === "theme" || node.type === "someday");
  $("#editRoutine").checked = !!node.recurring;
  fillStackSelect(node);
  $("#parkNode").hidden = node.type === "someday";

  const parentSel = $("#editParent");
  const blocked = descendantIds(map, node.id);
  const options = [`<option value="root">Center · new branch</option>`];
  for (const n of map.nodes || []) {
    if (n.id === node.id || blocked.has(n.id)) continue;
    options.push(
      `<option value="${n.id}" ${n.id === node.parentId ? "selected" : ""}>${escapeHtml(
        `${typeLabel(n.type)} · ${shorten(n.label, 32)}`
      )}</option>`
    );
  }
  parentSel.innerHTML = options.join("");
  if (node.parentId === map.root?.id) parentSel.value = "root";
}

function renderReview() {
  const strip = $("#reviewStrip");
  if (state.step !== "map" || !state.showReview) {
    strip.hidden = true;
    return;
  }
  strip.hidden = false;
  const list = $("#reviewList");
  const nodes = state.day.map?.nodes || [];
  if (!nodes.length) {
    list.innerHTML = `<p class="next-hint">Nothing to review yet.</p>`;
    return;
  }
  list.innerHTML = nodes
    .map((n) => {
      const opts = TYPE_ORDER
        .map(
          (t) =>
            `<option value="${t}" ${n.type === t ? "selected" : ""}>${typeLabel(t)}</option>`
        )
        .join("");
      return `<label class="review-row" data-id="${n.id}">
        <span title="${escapeHtml(n.full || n.label)}">${escapeHtml(n.label)}</span>
        <select data-review-type>${opts}</select>
      </label>`;
    })
    .join("");

  list.querySelectorAll("[data-review-type]").forEach((sel) => {
    sel.addEventListener("change", async (e) => {
      const row = e.target.closest(".review-row");
      const id = row?.getAttribute("data-id");
      const node = state.day.map.nodes.find((n) => n.id === id);
      if (!node) return;
      applyNodeType(node, e.target.value);
      state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
      await persist();
      renderMap();
      renderNext();
      renderEdit();
      renderChrome();
    });
  });
}

function wrapLabel(text, maxChars = 18) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

function renderMap() {
  const svg = $("#mindmap");
  const map = state.day.map;
  const linked = nodeForRoot(map);
  if (map.root && linked) map.root.done = !!linked.done;
  const shown = { ...map, nodes: visibleNodes(map) };
  state.layout = layoutMindmap(shown);
  const load = focusLoad(map.nodes);

  const { nodes, edges } = state.layout;
  const { x: vx, y: vy, scale } = state.view;
  const pathIds = state.focusMode ? focusNodeIds(map) : pathToNode(map, map.nextStepId);

  const edgeEls = edges
    .map((e) => {
      const midX = (e.x1 + e.x2) / 2;
      const midY = (e.y1 + e.y2) / 2;
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const cx = midX - dy * 0.08;
      const cy = midY + dx * 0.08;
      const onPath = pathIds.has(e.from) && pathIds.has(e.to);
      return `<path class="mm-edge ${e.isNext ? "is-next" : ""} ${onPath ? "on-path" : ""}" d="M ${e.x1} ${e.y1} Q ${cx} ${cy} ${e.x2} ${e.y2}" />`;
    })
    .join("");

  const nodeEls = nodes
    .map((n) => {
      const source = getNode(map, n.id) || n;
      const isRoot = n.type === "root";
      const colors = colorsFor(n.type);
      const identity =
        !isRoot && source.identity && (source.type === "goal" || source.type === "theme" || source.type === "someday")
          ? shorten(source.identity, 28)
          : "";
      const stackTarget = source.stackAfterId ? getNode(map, source.stackAfterId) : null;
      const stackLine = stackTarget ? `after ${shorten(stackTarget.label, 22)}` : "";
      const meta = !isRoot ? [source.timeLabel, source.context].filter(Boolean).join(" · ") : "";
      const extra = [meta, identity, stackLine].filter(Boolean);
      const box = nodeBox({ ...source, type: n.type, label: n.label, stackAfterId: stackTarget ? source.stackAfterId : null });
      const w = n.w || box.w;
      const h = n.h || box.h;
      const lines = wrapLabel(n.label, isRoot ? 16 : 16);
      const textFill = colors.ink;
      const labelY = (isRoot ? -((lines.length - 1) * 7) : -((lines.length - 1) * 7) + 4) - extra.length * 4;
      const label = lines
        .map((line, li) => `<tspan x="0" dy="${li === 0 ? 0 : 14}">${escapeHtml(line)}</tspan>`)
        .join("");
      const extraSvg = extra
        .map(
          (line, li) =>
            `<text class="subline" y="${labelY + lines.length * 14 + 2 + li * 12}" text-anchor="middle">${escapeHtml(line)}</text>`
        )
        .join("");
      const chipText = isRoot
        ? ""
        : state.focusMode && mustIds(map).has(n.id)
          ? `${typeLabel(n.type)} · Must`
          : typeLabel(n.type);
      const chip = isRoot
        ? ""
        : `<text class="chip" y="${-h / 2 + 13}" text-anchor="middle" style="fill:${colors.accent}">${escapeHtml(chipText)}</text>`;
      const accent = isRoot
        ? ""
        : `<rect x="${-w / 2}" y="${-h / 2}" width="5" height="${h}" rx="2" fill="${colors.accent}" />`;
      const check = n.done
        ? `<g class="mm-check">
            <title>Mark open</title>
            <circle class="hit" cx="${w / 2 - 12}" cy="${-h / 2 + 12}" r="14" />
            <circle cx="${w / 2 - 12}" cy="${-h / 2 + 12}" r="7" fill="#3d6b4f" />
            <path d="M ${w / 2 - 15} ${-h / 2 + 12} l 2.5 2.5 5 -5" fill="none" stroke="#f7f4ee" stroke-width="1.6" stroke-linecap="round" />
          </g>`
        : "";
      const reward = source.reward
        ? `<text class="reward-mark" x="${w / 2 - 12}" y="${h / 2 - 6}" text-anchor="middle">★</text>`
        : "";
      const onPath = pathIds.has(n.id);
      const overCap = load.parkedIds.has(n.id);

      return `
        <g class="mm-node ${isRoot ? "is-root" : ""} ${n.isNext ? "is-next" : ""} ${n.done ? "is-done" : ""} ${state.selectedId === n.id ? "is-selected" : ""} ${onPath ? "on-path" : ""} ${overCap ? "is-over-cap" : ""} ${state.celebrateId === n.id ? "is-celebrating" : ""}"
           data-id="${n.id}"
           data-type="${n.type}"
           transform="translate(${n.x}, ${n.y})">
          <rect class="bubble" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14"
            fill="${colors.fill}" stroke="${colors.stroke}" />
          ${accent}
          ${chip}
          ${check}
          ${reward}
          <text class="label" y="${labelY}" text-anchor="middle" fill="${textFill}">${label}</text>
          ${extraSvg}
        </g>`;
    })
    .join("");

  svg.innerHTML = `
    <g id="viewport" transform="translate(${vx}, ${vy}) scale(${scale})">
      <g id="world">${edgeEls}${nodeEls}</g>
    </g>`;

  fitIfNeeded();
  $("#canvasWrap")?.classList.toggle("is-focus", state.focusMode);

  svg.querySelectorAll(".mm-node").forEach((el) => {
    el.addEventListener("pointerdown", onNodePointerDown);
  });
  renderTimeline(map);
}

function onNodePointerDown(e) {
  if (e.button != null && e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();

  const el = e.currentTarget;
  const id = el.getAttribute("data-id");
  const laid = state.layout?.nodes.find((n) => n.id === id);
  if (!id || !laid) return;

  state.dragging = false;
  state.nodeDrag = {
    id,
    el,
    originX: laid.x,
    originY: laid.y,
    startClientX: e.clientX,
    startClientY: e.clientY,
    lastClientX: e.clientX,
    lastClientY: e.clientY,
    moved: false,
    dropTargetId: null,
    canDrag: id !== state.day.map?.root?.id,
    uncheck: !!e.target?.closest?.(".mm-check"),
  };

  if (state.nodeDrag.canDrag) {
    el.classList.add("is-dragging");
    el.setAttribute("pointer-events", "none");
  }
  $("#canvasWrap")?.setPointerCapture?.(e.pointerId);
}

function clientToWorld(clientX, clientY) {
  const rect = $("#canvasWrap").getBoundingClientRect();
  const { x, y, scale } = state.view;
  const safe = scale || 1;
  return {
    x: (clientX - rect.left - x) / safe,
    y: (clientY - rect.top - y) / safe,
  };
}

function nodeUnderPointer(clientX, clientY, dragId) {
  const dragEl = state.nodeDrag?.el;
  const prev = dragEl?.style.visibility;
  if (dragEl) dragEl.style.visibility = "hidden";
  const top = document.elementFromPoint(clientX, clientY);
  if (dragEl) dragEl.style.visibility = prev || "";
  const id = top?.closest?.(".mm-node")?.getAttribute("data-id");
  if (!id || id === dragId) return null;
  if (isDescendantOf(state.day.map, dragId, id)) return null;
  return id;
}

/** The card under the pointer becomes the parent, so the box nests as its subbranch. */
function branchDropTarget(clientX, clientY, dragId) {
  const map = state.day.map;
  const direct = nodeUnderPointer(clientX, clientY, dragId);
  if (direct && canDropOn(dragId, direct)) return direct;

  const world = clientToWorld(clientX, clientY);
  let nearest = null;
  let nearestDist = Infinity;
  for (const node of state.layout?.nodes || []) {
    if (!node || node.id === dragId) continue;
    if (isDescendantOf(map, dragId, node.id)) continue;
    const dist = Math.hypot(world.x - node.x, world.y - node.y);
    const reach = Math.hypot(node.w || 156, node.h || 80) / 2 + 36;
    if (dist > reach || dist >= nearestDist) continue;
    nearest = node;
    nearestDist = dist;
  }
  if (!nearest || !canDropOn(dragId, nearest.id)) return null;
  return nearest.id;
}

function isDescendantOf(map, ancestorId, nodeId) {
  let cur = getNode(map, nodeId);
  const guard = new Set();
  while (cur && cur.parentId) {
    if (cur.parentId === ancestorId) return true;
    if (guard.has(cur.parentId)) break;
    guard.add(cur.parentId);
    cur = getNode(map, cur.parentId);
  }
  return false;
}

function canDropOn(dragId, targetId) {
  const map = state.day.map;
  if (!map || !dragId || !targetId || dragId === targetId) return false;
  if (dragId === map.root?.id) return false;
  if (isDescendantOf(map, dragId, targetId)) return false;

  const target = getNode(map, targetId);
  return !!target || targetId === map.root?.id;
}

function updateDropHighlight(targetId) {
  const svg = $("#mindmap");
  svg?.querySelectorAll(".mm-node.is-drop-target").forEach((n) => n.classList.remove("is-drop-target"));
  if (targetId) {
    svg?.querySelector(`.mm-node[data-id="${CSS.escape(targetId)}"]`)?.classList.add("is-drop-target");
  }
  updateLinkPreview(targetId);
}

function updateLinkPreview(targetId) {
  const world = $("#world");
  const drag = state.nodeDrag;
  if (!world || !drag) return;

  world.querySelector("#linkPreview")?.remove();
  if (!targetId || !drag.moved) return;

  const target = state.layout?.nodes.find((n) => n.id === targetId);
  if (!target) return;

  const x2 = drag.originX + (drag.lastClientX - drag.startClientX) / state.view.scale;
  const y2 = drag.originY + (drag.lastClientY - drag.startClientY) / state.view.scale;
  const midX = (target.x + x2) / 2;
  const midY = (target.y + y2) / 2;
  const dx = x2 - target.x;
  const dy = y2 - target.y;
  const cx = midX - dy * 0.08;
  const cy = midY + dx * 0.08;

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("id", "linkPreview");
  path.setAttribute("class", "mm-link-preview");
  path.setAttribute("d", `M ${target.x} ${target.y} Q ${cx} ${cy} ${x2} ${y2}`);
  world.insertBefore(path, world.firstChild);
}

async function applyReparent(dragId, parentId) {
  const map = state.day.map;
  const node = map.nodes.find((n) => n.id === dragId);
  if (!node || !canDropOn(dragId, parentId)) return false;

  if (parentId === map.root.id) {
    node.parentId = map.root.id;
    node.manualParent = "root";
  } else {
    const parent = getNode(map, parentId);
    node.parentId = parentId;
    node.manualParent = parent?.full || parent?.label || "root";
  }

  map.nextStepId = pickNextStep(map.nodes);
  state.selectedId = dragId;
  await persist();
  return true;
}

async function onOpenBranch() {
  const map = state.day.map;
  const node = map?.nodes?.find((item) => item.id === state.selectedId);
  if (!node || node.type === "root") return;
  node.parentId = map.root.id;
  node.manualParent = "root";
  map.nextStepId = pickNextStep(map.nodes);
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderChrome();
}

function descendantIds(map, id) {
  const ids = new Set();
  const walk = (parentId) => {
    for (const node of map?.nodes || []) {
      if (node.parentId !== parentId || ids.has(node.id)) continue;
      ids.add(node.id);
      walk(node.id);
    }
  };
  walk(id);
  return ids;
}

async function finishNodeClick(id) {
  const map = state.day.map;
  state.selectedId = id;
  const node = getNode(map, id);
  if (node && (node.type === "action" || node.type === "blocker") && !node.done) {
    map.nextStepId = id;
    await persist();
  }
  renderMap();
  renderNext();
  renderEdit();
  renderChrome();
}

function fitIfNeeded() {
  const wrap = $("#canvasWrap");
  if (!state.layout || !wrap) return;

  if (Math.abs(state.view.x) > 2 || Math.abs(state.view.y) > 2 || Math.abs(state.view.scale - 1) > 0.02) {
    applyView();
    return;
  }

  const rect = wrap.getBoundingClientRect();
  state.view.x = rect.width / 2;
  state.view.y = rect.height / 2;
  applyView();
}

function applyView() {
  const vp = $("#viewport");
  if (!vp) return;
  const { x, y, scale } = state.view;
  vp.setAttribute("transform", `translate(${x}, ${y}) scale(${scale})`);
}

function centerOn(id) {
  const node = state.layout?.nodes.find((n) => n.id === id);
  const wrap = $("#canvasWrap");
  if (!node || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  state.view.x = rect.width / 2 - node.x * state.view.scale;
  state.view.y = rect.height / 2 - node.y * state.view.scale;
  applyView();
}

function resetView() {
  state.view = { x: 0, y: 0, scale: 1 };
  fitIfNeeded();
}

function zoomBy(factor) {
  const wrap = $("#canvasWrap");
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const before = state.view.scale;
  const next = Math.min(2.4, Math.max(0.45, before * factor));
  state.view.x = cx - ((cx - state.view.x) / before) * next;
  state.view.y = cy - ((cy - state.view.y) / before) * next;
  state.view.scale = next;
  applyView();
}

function onPointerDown(e) {
  if (state.nodeDrag) return;
  if (e.target.closest?.(".mm-node") || e.target.closest?.(".tool")) return;
  state.dragging = true;
  state.lastPtr = { x: e.clientX, y: e.clientY };
  $("#canvasWrap").classList.add("is-panning");
  $("#canvasWrap").setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  if (state.timelineDrag) {
    moveTimelineDrag(e);
    return;
  }
  if (state.nodeDrag) {
    const drag = state.nodeDrag;
    drag.lastClientX = e.clientX;
    drag.lastClientY = e.clientY;
    const dx = e.clientX - drag.startClientX;
    const dy = e.clientY - drag.startClientY;

    if (!drag.canDrag) return;

    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      drag.moved = true;
      $("#canvasWrap")?.classList.add("is-node-dragging");
    }

    if (drag.moved) {
      const wx = drag.originX + dx / state.view.scale;
      const wy = drag.originY + dy / state.view.scale;
      drag.el.setAttribute("transform", `translate(${wx}, ${wy})`);

      const nextTarget = branchDropTarget(e.clientX, e.clientY, drag.id);
      if (nextTarget !== drag.dropTargetId) {
        drag.dropTargetId = nextTarget;
        updateDropHighlight(nextTarget);
      } else {
        updateLinkPreview(drag.dropTargetId);
      }
    }
    return;
  }

  if (!state.dragging || !state.lastPtr) return;
  const dx = e.clientX - state.lastPtr.x;
  const dy = e.clientY - state.lastPtr.y;
  state.view.x += dx;
  state.view.y += dy;
  state.lastPtr = { x: e.clientX, y: e.clientY };
  applyView();
}

async function onPointerUp(e) {
  if (state.timelineDrag) {
    await finishTimelineDrag(e);
    return;
  }
  if (state.nodeDrag) {
    const drag = state.nodeDrag;
    const moved = drag.moved;
    const id = drag.id;
    const releaseX = e.clientX || drag.lastClientX;
    const releaseY = e.clientY || drag.lastClientY;
    const dropId = branchDropTarget(releaseX, releaseY, id);

    drag.el.classList.remove("is-dragging");
    drag.el.removeAttribute("pointer-events");
    $("#canvasWrap")?.classList.remove("is-node-dragging");
    updateDropHighlight(null);
    $("#world")?.querySelector("#linkPreview")?.remove();
    state.nodeDrag = null;

    if (!moved) {
      if (drag.uncheck) {
        await onMarkOpen(id);
        return;
      }
      await finishNodeClick(id);
      return;
    }

    const point = document.elementFromPoint(drag.lastClientX, drag.lastClientY);
    if (point?.closest?.("#timelineTrack")) {
      await applyTime(id, minutesFromTrackY(drag.lastClientY));
      return;
    }
    if (point?.closest?.("#timelineOpen")) {
      await applyTime(id, null);
      return;
    }

    if (dropId) {
      const ok = await applyReparent(id, dropId);
      if (ok) {
        renderMap();
        renderNext();
        renderEdit();
        renderChrome();
        return;
      }
    }

    renderMap();
    return;
  }

  state.dragging = false;
  state.lastPtr = null;
  $("#canvasWrap")?.classList.remove("is-panning");
}

function onWheel(e) {
  e.preventDefault();
  const wrap = $("#canvasWrap");
  const rect = wrap.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const before = state.view.scale;
  const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
  const next = Math.min(2.4, Math.max(0.45, before * factor));
  state.view.x = mx - ((mx - state.view.x) / before) * next;
  state.view.y = my - ((my - state.view.y) / before) * next;
  state.view.scale = next;
  applyView();
}

function onKeyDown(e) {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "input" || tag === "select") return;

  if (state.step !== "map") return;

  if (e.key === "d" || e.key === "D") {
    e.preventDefault();
    onMarkDone();
  } else if (e.key === "f" || e.key === "F") {
    e.preventDefault();
    state.focusMode = !state.focusMode;
    renderMap();
    renderChrome();
  } else if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    const id = state.day.map?.nextStepId;
    if (id) {
      state.selectedId = id;
      centerOn(id);
      renderMap();
      renderNext();
      renderEdit();
    }
  } else if (e.key === "+" || e.key === "=") {
    e.preventDefault();
    zoomBy(1.15);
  } else if (e.key === "-" || e.key === "_") {
    e.preventDefault();
    zoomBy(1 / 1.15);
  } else if (e.key === "0") {
    e.preventDefault();
    resetView();
  } else if (e.key === "e" || e.key === "E") {
    e.preventDefault();
    state.step = "capture";
    render();
    requestAnimationFrame(() => $("#thoughts")?.focus());
  }
}

function syncGhost() {
  const field = $("#thoughts");
  const ghost = $("#ghostDump");
  if (!field || !ghost) return;
  ghost.hidden = !!field.value.trim();
}

function releaseCelebration(id) {
  window.setTimeout(() => {
    if (state.celebrateId !== id) return;
    state.celebrateId = null;
    document.querySelector(`.mm-node[data-id="${CSS.escape(id)}"]`)?.classList.remove("is-celebrating");
  }, 700);
}

async function onReward() {
  const id = state.selectedId || state.day.map?.nextStepId;
  if (!id || id === state.day.map?.root?.id) return;
  const node = state.day.map.nodes.find((item) => item.id === id);
  if (!node) return;
  node.reward = !node.reward;
  state.celebrateId = node.id;
  await persist();
  renderMap();
  renderNext();
  releaseCelebration(id);
}

async function onPark() {
  const node = state.day.map?.nodes?.find((item) => item.id === state.selectedId);
  if (!node) return;
  applyNodeType(node, "someday");
  node.urgent = false;
  node.important = false;
  node.priorityManual = true;
  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  state.selectedId = state.day.map.nextStepId;
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderReview();
  renderChrome();
}

async function onPriorityClick(e) {
  const button = e.target.closest("#priorityMatrix button");
  if (!button) return;
  const node = state.day.map?.nodes?.find((item) => item.id === state.selectedId);
  if (!node) return;
  node.urgent = button.dataset.urgent === "true";
  node.important = button.dataset.important === "true";
  node.priorityManual = true;
  document.querySelectorAll("#priorityMatrix button").forEach((el) => {
    const on = el === button;
    el.classList.toggle("is-on", on);
    el.setAttribute("aria-pressed", on ? "true" : "false");
  });
  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  await persist();
  renderMap();
  renderNext();
  renderChrome();
}

function onFilterClick(e) {
  const button = e.target.closest("[data-context]");
  if (!button) return;
  state.contextFilter = button.dataset.context;
  document.querySelectorAll("#filterRow [data-context]").forEach((el) => {
    el.classList.toggle("is-on", el === button);
  });
  renderMap();
  renderNext();
}

function paintMatrix(node) {
  const urgent = !!node.urgent;
  const important = !!node.important;
  document.querySelectorAll("#priorityMatrix button").forEach((button) => {
    const on = (button.dataset.urgent === "true") === urgent && (button.dataset.important === "true") === important;
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function minutesToInput(mins) {
  if (!Number.isFinite(mins)) return "";
  const hour = Math.floor(mins / 60);
  const minute = mins % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function fillStackSelect(node) {
  const select = $("#editStack");
  const options = [`<option value="">None</option>`];
  for (const other of state.day.map?.nodes || []) {
    if (other.id === node.id) continue;
    if (!other.recurring && other.type !== "goal" && other.type !== "theme") continue;
    const selected = other.id === node.stackAfterId ? "selected" : "";
    options.push(`<option value="${other.id}" ${selected}>${escapeHtml(shorten(other.label, 36))}</option>`);
  }
  select.innerHTML = options.join("");
  if (node.stackAfterId) select.value = node.stackAfterId;
}

function applyEditMeta(node) {
  const timeVal = $("#editTime").value;
  if (timeVal) {
    const [hour, minute] = timeVal.split(":").map(Number);
    const minutes = hour * 60 + minute;
    node.timeMinutes = minutes;
    node.timeLabel = formatClock(minutes);
    node.timeManual = true;
    node.full = replaceTime(node.full || node.label, minutes);
    node.label = shorten(node.full, 72);
  } else {
    node.timeManual = true;
    node.timeMinutes = null;
    node.timeLabel = null;
    node.full = clearTime(node.full || node.label);
    node.label = shorten(node.full, 72);
  }

  const pressed = document.querySelector("#priorityMatrix button.is-on");
  if (pressed) {
    node.urgent = pressed.dataset.urgent === "true";
    node.important = pressed.dataset.important === "true";
    node.priorityManual = true;
  }

  node.context = $("#editContext").value || null;
  node.contextManual = true;
  node.identity = $("#editIdentity").value.trim();
  node.recurring = $("#editRoutine").checked;
  node.routineManual = true;

  const stackId = $("#editStack").value;
  node.stackManual = true;
  if (!stackId) {
    node.stackAfterId = null;
    node.stackAfterKey = null;
  } else {
    const target = getNode(state.day.map, stackId);
    node.stackAfterId = stackId;
    node.stackAfterKey = thoughtKey(target?.full || target?.label || "");
    if (target) target.recurring = true;
  }
  annotateNode(node);
  resolveStacks(state.day.map.nodes);
}

function visibleNodes(map) {
  const all = map?.nodes || [];
  const pass = (node) => {
    if (!state.showSomeday && (node.type === "someday" || node.bucket === "someday")) return false;
    if (state.contextFilter !== "all" && node.context !== state.contextFilter) return false;
    return true;
  };
  const kept = new Map();
  for (const node of all) {
    if (!pass(node)) continue;
    kept.set(node.id, node);
    let parentId = node.parentId;
    const guard = new Set();
    while (parentId && parentId !== map.root?.id && !guard.has(parentId)) {
      guard.add(parentId);
      const parent = all.find((item) => item.id === parentId);
      if (!parent) break;
      if ((parent.type === "someday" || parent.bucket === "someday") && !state.showSomeday) break;
      kept.set(parent.id, parent);
      parentId = parent.parentId;
    }
  }
  let nodes = [...kept.values()];
  if (state.focusMode) {
    const ids = focusNodeIds(map);
    nodes = nodes.filter((node) => ids.has(node.id));
    for (const id of ids) {
      if (id === map.root?.id || nodes.some((node) => node.id === id)) continue;
      const node = all.find((item) => item.id === id);
      if (node) nodes.push(node);
    }
  }
  return nodes;
}

function mustIds(map) {
  const ids = new Set();
  for (const node of map?.nodes || []) {
    if (!node || node.type === "root" || node.done) continue;
    if (node.type === "someday" || node.bucket === "someday") continue;
    if (node.urgent && node.important) ids.add(node.id);
  }
  return ids;
}

/** Must tasks, plus the branch that holds each one so the map stays connected. */
function focusNodeIds(map) {
  const ids = mustIds(map);
  if (!ids.size && map?.nextStepId) ids.add(map.nextStepId);
  const all = map?.nodes || [];
  for (const id of [...ids]) {
    let parentId = all.find((node) => node.id === id)?.parentId;
    const guard = new Set();
    while (parentId && parentId !== map?.root?.id && !guard.has(parentId)) {
      guard.add(parentId);
      ids.add(parentId);
      const parent = all.find((node) => node.id === parentId);
      parentId = parent?.parentId;
    }
  }
  if (map?.root?.id) ids.add(map.root.id);
  return ids;
}

function focusedNodeId() {
  const map = state.day.map;
  if (!map) return null;
  if (state.contextFilter === "all") return map.nextStepId || state.selectedId;
  const pool = (map.nodes || []).filter(
    (node) => node.context === state.contextFilter && !node.done && node.type !== "someday"
  );
  return explainNext(pool).id || map.nextStepId || state.selectedId;
}

function renderLegend() {
  const host = $("#typeLegend");
  if (!host) return;
  host.innerHTML = TYPE_ORDER.map((type) => {
    const colors = colorsFor(type);
    return `<span class="legend-item"><i style="background:${colors.stroke}"></i>${escapeHtml(TYPE_LABELS[type])}</span>`;
  }).join("");
}

function renderTimeline(map) {
  const track = $("#timelineTrack");
  const open = $("#timelineOpen");
  if (!track || !open) return;
  const nodes = visibleNodes(map).filter((node) => !state.focusMode || mustIds(map).has(node.id) || node.id === map?.nextStepId);
  const timed = nodes
    .filter((node) => Number.isFinite(node.timeMinutes))
    .sort((a, b) => a.timeMinutes - b.timeMinutes);
  const untimed = nodes.filter((node) => !Number.isFinite(node.timeMinutes));
  const items = timed
    .map((node) => {
      const colors = colorsFor(node.type);
      return `<button type="button" class="time-item ${state.selectedId === node.id ? "is-selected" : ""}" data-id="${node.id}" style="border-color:${colors.stroke}">
        <span class="time-label">${escapeHtml(node.timeLabel || formatClock(node.timeMinutes))}</span>
        <span class="time-name">${escapeHtml(shorten(node.label, 32))}</span>
      </button>`;
    })
    .join("");
  track.innerHTML = items || `<p class="timeline-empty">No times yet</p>`;
  open.innerHTML =
    untimed
      .slice(0, 6)
      .map(
        (node) =>
          `<button type="button" class="open-item ${state.selectedId === node.id ? "is-selected" : ""}" data-id="${node.id}">${escapeHtml(shorten(node.label, 32))}</button>`
      )
      .join("") || `<p class="timeline-empty">Nothing open</p>`;
}

function minutesFromTrackY(clientY) {
  const rect = $("#timelineTrack").getBoundingClientRect();
  const ratio = rect.height ? Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) : 0;
  return snapMinutes(DAY_START + ratio * (DAY_END - DAY_START));
}

async function applyTime(id, minutes) {
  const node = state.day.map?.nodes?.find((item) => item.id === id);
  if (!node) return;
  if (minutes == null) {
    node.timeMinutes = null;
    node.timeLabel = null;
    node.timeManual = true;
    node.full = clearTime(node.full || node.label);
  } else {
    const snapped = snapMinutes(minutes);
    node.timeMinutes = snapped;
    node.timeLabel = formatClock(snapped);
    node.timeManual = true;
    node.full = replaceTime(node.full || node.label, snapped);
  }
  node.label = shorten(node.full || "", 72);
  annotateNode(node);
  syncThoughtsFromNodes();
  state.selectedId = id;
  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  await persist();
  renderMap();
  renderNext();
  renderEdit();
  renderChrome();
}

function onTimelinePointerDown(e) {
  const item = e.target.closest?.(".time-item, .open-item");
  if (!item) return;
  e.stopPropagation();
  const id = item.getAttribute("data-id");
  state.timelineDrag = {
    id,
    moved: false,
    startY: e.clientY,
    fromOpen: item.classList.contains("open-item"),
  };
  item.classList.add("is-dragging");
  state.selectedId = id;
}

function moveTimelineDrag(e) {
  const drag = state.timelineDrag;
  if (!drag) return;
  if (Math.abs(e.clientY - drag.startY) > 4) drag.moved = true;
  const item = document.querySelector(`.time-item[data-id="${CSS.escape(drag.id)}"]`);
  if (!item || !drag.moved) return;
  item.style.transform = `translateY(${e.clientY - drag.startY}px)`;
  const label = item.querySelector(".time-label");
  if (label) label.textContent = formatClock(minutesFromTrackY(e.clientY));
}

async function finishTimelineDrag(e) {
  const drag = state.timelineDrag;
  if (!drag) return;
  state.timelineDrag = null;
  document.querySelectorAll(".time-item.is-dragging, .open-item.is-dragging").forEach((el) => {
    el.classList.remove("is-dragging");
  });
  if (!drag.moved) {
    state.selectedId = drag.id;
    centerOn(drag.id);
    renderMap();
    renderNext();
    renderEdit();
    return;
  }
  const point = document.elementFromPoint(e.clientX, e.clientY);
  const onOpen = point?.closest?.("#timelineOpen");
  const onTrack = point?.closest?.("#timelineTrack");
  if (onOpen || (drag.fromOpen && !onTrack)) {
    await applyTime(drag.id, null);
    return;
  }
  await applyTime(drag.id, minutesFromTrackY(e.clientY));
}

async function onOpenWeek() {
  if (state.step !== "week") state.returnStep = state.step;
  state.step = "week";
  const stored = await getRecentDays(7);
  const days = [state.day, ...stored.filter((day) => day.date !== state.day?.date)].filter(
    (day) => day?.map?.nodes?.length
  );
  renderWeek(rollupWeek(days));
  render();
}

function renderWeek(rollup) {
  $("#statBecame").textContent = String(rollup.wantsBecameDos);
  $("#statBlockers").textContent = String(rollup.blockersRecurred);
  $("#statDone").textContent = String(rollup.done);
  $("#statRewards").textContent = String(rollup.rewards);
  const list = $("#insightList");
  if (!rollup.days) {
    list.innerHTML = `<article class="insight is-calm"><h3>No days mapped yet</h3><p>Dump today’s thoughts and this review will start counting Wants, Dos, and repeating Blockers.</p></article>`;
    return;
  }
  list.innerHTML = rollup.insights
    .map((insight) => {
      const calm = /no repeating/i.test(insight.title);
      return `<article class="insight ${calm ? "is-calm" : ""}"><h3>${escapeHtml(insight.title)}</h3><p>${escapeHtml(insight.fix)}</p></article>`;
    })
    .join("");
}

init();
