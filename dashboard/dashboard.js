import { getDay, saveDay, getSettings, saveSettings, dateKey, emptyDay, todayStorageKey } from "../shared/storage.js";
import {
  remapThoughts,
  getNode,
  pickNextStep,
  progress,
  typeCounts,
  pathToNode,
  shorten,
} from "../shared/parse.js";
import { layoutMindmap } from "../shared/layout.js";
import { escapeHtml } from "../shared/util.js";

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
};

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
  render();

  if (params.get("focus") === "capture") {
    requestAnimationFrame(() => $("#thoughts")?.focus());
  }
}

function bind() {
  $("#thoughtForm").addEventListener("submit", onMapThoughts);
  $("#remap").addEventListener("click", () => {
    state.step = "capture";
    state.showReview = false;
    render();
    requestAnimationFrame(() => $("#thoughts")?.focus());
  });
  $("#resetDay").addEventListener("click", onReset);
  $("#markDone").addEventListener("click", onMarkDone);
  $("#topPrimary").addEventListener("click", onMarkDone);
  $("#pinNext").addEventListener("click", onPinNext);
  $("#toggleFocus").addEventListener("click", () => {
    state.focusMode = !state.focusMode;
    renderMap();
    renderChrome();
  });
  $("#focusNode").addEventListener("click", () => {
    const id = state.day.map?.nextStepId || state.selectedId;
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
  const id = state.day.map?.nextStepId || state.selectedId;
  if (!id || id === state.day.map.root?.id) return;
  const node = state.day.map.nodes.find((n) => n.id === id);
  if (!node) return;
  node.done = !node.done;
  state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  state.selectedId = state.day.map.nextStepId;
  await persist();
  renderMap();
  renderNext();
  renderChrome();
  renderReview();
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
  node.type = type;
  node.manualType = type;

  if (parentVal === "root") {
    node.parentId = state.day.map.root.id;
    node.manualParent = "root";
  } else if (parentVal && parentVal !== id) {
    node.parentId = parentVal;
    const parent = getNode(state.day.map, parentVal);
    node.manualParent = parent?.full || parent?.label || "root";
  }

  if (state.day.map.nextStepId === id && node.done) {
    state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
  }

  // Keep thoughts text roughly in sync for remaps
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
  if (lines.length) state.day.thoughts = lines.join("\n");
}

async function persist() {
  state.applyingRemote = true;
  state.day = await saveDay(state.day);
  state.applyingRemote = false;
}

function render() {
  $("#panel-capture").hidden = state.step !== "capture";
  $("#panel-map").hidden = state.step !== "map";

  if (state.step === "capture") {
    $("#thoughts").value = state.day.thoughts || "";
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

  const { done, total } = progress(state.day.map);
  const progressPill = $("#progressPill");
  const statusPill = $("#statusPill");
  const topPrimary = $("#topPrimary");
  const toggleFocus = $("#toggleFocus");

  if (state.step === "map" && total) {
    progressPill.hidden = false;
    progressPill.textContent = `${done}/${total} moves`;
    statusPill.textContent = state.focusMode ? "Focus path" : "Mapped";
  } else if (state.step === "capture") {
    progressPill.hidden = true;
    statusPill.textContent = state.day.mapped ? "Editing dump" : "Ready";
  } else {
    progressPill.hidden = true;
    statusPill.textContent = "Mapped";
  }

  const onMap = state.step === "map";
  toggleFocus.hidden = !onMap;
  toggleFocus.classList.toggle("primary", state.focusMode);
  toggleFocus.textContent = state.focusMode ? "Exit focus" : "Focus";
  topPrimary.hidden = !onMap || !state.day.map?.nextStepId;
  const next = getNode(state.day.map, state.day.map?.nextStepId);
  if (next) topPrimary.textContent = next.done ? "Mark open" : "Mark done";

  $("#canvasWrap")?.classList.toggle("is-focus", state.focusMode);
  $("#canvasBanner").hidden = !state.focusMode;
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

  if (!next) {
    $("#nextTitle").textContent = map.nodes?.length ? "All clear — map again or add more" : "No steps yet";
    $("#nextHint").textContent = "Dump more thoughts to find a next move.";
    $("#decisionText").textContent = total ? `${done}/${total} moves complete.` : "Map your thoughts to begin.";
    $("#markDone").disabled = true;
    $("#pinNext").disabled = true;
    return;
  }

  $("#markDone").disabled = false;
  $("#pinNext").disabled = !selected || selected.type === "root" || selected.done;
  $("#nextTitle").textContent = next.full || next.label;
  const kind =
    next.type === "blocker"
      ? "Unblock this first"
      : next.type === "action"
        ? "Clearest next action"
        : "Worth focusing here";
  $("#nextHint").textContent = kind;
  $("#markDone").textContent = next.done ? "Mark open" : "Mark done";

  if (selected && selected.id !== next.id && selected.type !== "root") {
    $("#decisionText").textContent = `Selected “${selected.label}” (${typeLabel(selected.type)}). Pin it, edit it, or keep the suggested next step.`;
  } else {
    $("#decisionText").textContent = `Do this next, then mark done to advance. ${done}/${total || 0} moves complete.`;
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
  $("#editLabel").value = node.full || node.label;
  $("#editType").value = ["goal", "theme", "action", "blocker", "note"].includes(node.type)
    ? node.type
    : "note";

  const parentSel = $("#editParent");
  const options = [`<option value="root">Focus (root)</option>`];
  for (const n of map.nodes || []) {
    if (n.id === node.id) continue;
    if (n.type === "action" || n.type === "blocker") continue;
    options.push(
      `<option value="${n.id}" ${n.id === node.parentId ? "selected" : ""}>${escapeHtml(
        shorten(n.label, 36)
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
      const opts = ["goal", "theme", "action", "blocker", "note"]
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
      node.type = e.target.value;
      node.manualType = e.target.value;
      if (state.day.map.nextStepId === id && (node.type === "note" || node.type === "theme")) {
        state.day.map.nextStepId = pickNextStep(state.day.map.nodes);
      }
      await persist();
      renderMap();
      renderNext();
      renderEdit();
      renderChrome();
    });
  });
}

function typeLabel(type) {
  return (
    {
      root: "Focus",
      goal: "Want",
      theme: "Theme",
      action: "Do",
      blocker: "Blocker",
      note: "Note",
    }[type] || type
  );
}

function accentFor(type) {
  switch (type) {
    case "goal":
    case "theme":
      return "#2a5280";
    case "action":
      return "#3d6b4f";
    case "blocker":
      return "#8a3b2c";
    default:
      return "#6a6358";
  }
}

function nodeColors(type, isNext) {
  if (isNext) return { fill: "rgba(59, 110, 165, 0.16)", stroke: "#3b6ea5" };
  switch (type) {
    case "root":
      return { fill: "rgba(42, 82, 128, 0.95)", stroke: "#2a5280" };
    case "goal":
    case "theme":
      return { fill: "rgba(250, 247, 240, 0.98)", stroke: "#2a5280" };
    case "action":
      return { fill: "rgba(255, 255, 255, 0.95)", stroke: "#3d6b4f" };
    case "blocker":
      return { fill: "rgba(138, 59, 44, 0.1)", stroke: "#8a3b2c" };
    default:
      return { fill: "rgba(250, 247, 240, 0.9)", stroke: "#6a6358" };
  }
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
  state.layout = layoutMindmap(map);

  const { nodes, edges } = state.layout;
  const { x: vx, y: vy, scale } = state.view;
  const pathIds = pathToNode(map, map.nextStepId);

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
      const isRoot = n.type === "root";
      const w = isRoot ? 158 : n.type === "goal" || n.type === "theme" ? 140 : 124;
      const lines = wrapLabel(n.label, isRoot ? 16 : 15);
      const h = 34 + lines.length * 14 + (isRoot ? 2 : 14);
      const colors = nodeColors(n.type, n.isNext);
      const textFill = isRoot ? "#f7f4ee" : "#1c1915";
      const labelY = isRoot ? -((lines.length - 1) * 7) : -((lines.length - 1) * 7) + 6;
      const label = lines
        .map(
          (line, li) =>
            `<tspan x="0" dy="${li === 0 ? 0 : 14}">${escapeHtml(line)}</tspan>`
        )
        .join("");
      const chip = isRoot
        ? ""
        : `<text class="chip" y="${-h / 2 + 13}" text-anchor="middle">${typeLabel(n.type)}</text>`;
      const accent = isRoot
        ? ""
        : `<rect x="${-w / 2}" y="${-h / 2}" width="4" height="${h}" rx="2" fill="${accentFor(n.type)}" />`;
      const check = n.done
        ? `<circle cx="${w / 2 - 12}" cy="${-h / 2 + 12}" r="7" fill="#3d6b4f" />
           <path d="M ${w / 2 - 15} ${-h / 2 + 12} l 2.5 2.5 5 -5" fill="none" stroke="#f7f4ee" stroke-width="1.6" stroke-linecap="round" />`
        : "";
      const onPath = pathIds.has(n.id);

      return `
        <g class="mm-node ${isRoot ? "is-root" : ""} ${n.isNext ? "is-next" : ""} ${n.done ? "is-done" : ""} ${state.selectedId === n.id ? "is-selected" : ""} ${onPath ? "on-path" : ""}"
           data-id="${n.id}"
           transform="translate(${n.x}, ${n.y})">
          <rect class="bubble" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14"
            fill="${colors.fill}" stroke="${colors.stroke}" />
          ${accent}
          ${chip}
          ${check}
          <text class="label" y="${labelY}" text-anchor="middle" fill="${textFill}">${label}</text>
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
  };

  if (state.nodeDrag.canDrag) {
    el.classList.add("is-dragging");
    el.setAttribute("pointer-events", "none");
  }
  $("#canvasWrap")?.setPointerCapture?.(e.pointerId);
}

function hitTestNode(clientX, clientY, excludeId) {
  const prev = state.nodeDrag?.el;
  if (prev) prev.style.visibility = "hidden";
  const top = document.elementFromPoint(clientX, clientY);
  if (prev) prev.style.visibility = "";
  const g = top?.closest?.(".mm-node");
  if (!g) return null;
  const id = g.getAttribute("data-id");
  if (!id || id === excludeId) return null;
  return id;
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

  if (targetId === map.root?.id) return true;
  const target = getNode(map, targetId);
  if (!target) return false;
  // Containers only — same rule as the Parent dropdown
  return target.type === "goal" || target.type === "theme" || target.type === "note" || target.type === "root";
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

  node.parentId = parentId === map.root.id ? map.root.id : parentId;
  const parent = getNode(map, parentId);
  node.manualParent = parentId === map.root.id ? "root" : parent?.full || parent?.label || "root";

  state.selectedId = dragId;
  await persist();
  return true;
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

      const hitId = hitTestNode(e.clientX, e.clientY, drag.id);
      const nextTarget = hitId && canDropOn(drag.id, hitId) ? hitId : null;
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

async function onPointerUp() {
  if (state.nodeDrag) {
    const drag = state.nodeDrag;
    const moved = drag.moved;
    const dropId = drag.dropTargetId;
    const id = drag.id;

    drag.el.classList.remove("is-dragging");
    drag.el.removeAttribute("pointer-events");
    $("#canvasWrap")?.classList.remove("is-node-dragging");
    updateDropHighlight(null);
    $("#world")?.querySelector("#linkPreview")?.remove();
    state.nodeDrag = null;

    if (!moved) {
      await finishNodeClick(id);
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

    // Snap back
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

  if (state.step === "capture") return;

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

init();
