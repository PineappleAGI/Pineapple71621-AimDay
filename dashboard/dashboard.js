import { getDay, saveDay, getSettings, saveSettings, dateKey, emptyDay } from "../shared/storage.js";
import { thoughtsToMap, getNode, pickNextStep, progress } from "../shared/parse.js";
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
};

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
  render();
}

function bind() {
  $("#thoughtForm").addEventListener("submit", onMapThoughts);
  $("#remap").addEventListener("click", () => {
    state.step = "capture";
    render();
  });
  $("#resetDay").addEventListener("click", onReset);
  $("#markDone").addEventListener("click", onMarkDone);
  $("#focusNode").addEventListener("click", () => {
    const id = state.day.map?.nextStepId || state.selectedId;
    if (id) {
      state.selectedId = id;
      centerOn(id);
      renderMap();
      renderNext();
    }
  });
  $("#openOnStartup").addEventListener("change", async () => {
    state.settings = await saveSettings({ openOnStartup: $("#openOnStartup").checked });
  });
  $("#zoomIn").addEventListener("click", () => zoomBy(1.15));
  $("#zoomOut").addEventListener("click", () => zoomBy(1 / 1.15));
  $("#zoomReset").addEventListener("click", resetView);

  const wrap = $("#canvasWrap");
  wrap.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  wrap.addEventListener("wheel", onWheel, { passive: false });
}

async function onMapThoughts(e) {
  e.preventDefault();
  const raw = $("#thoughts").value.trim();
  if (!raw) return;

  const map = thoughtsToMap(raw);
  state.day.thoughts = raw;
  state.day.map = map;
  state.day.mapped = map.nodes.length > 0;
  state.selectedId = map.nextStepId;
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
  renderProgress();
}

async function persist() {
  state.day = await saveDay(state.day);
}

function render() {
  const d = new Date();
  $("#dateLine").textContent = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  $("#panel-capture").hidden = state.step !== "capture";
  $("#panel-map").hidden = state.step !== "map";

  if (state.step === "capture") {
    $("#thoughts").value = state.day.thoughts || "";
  }
  if (state.step === "map") {
    renderMap();
    renderNext();
  }
  renderProgress();
}

function renderProgress() {
  const { done, total, pct } = progress(state.day.map);
  const wrap = $("#progressWrap");
  if (!total || state.step !== "map") {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  $("#progressFill").style.width = `${pct}%`;
  $("#progressLabel").textContent = `${done}/${total} done`;
}

function renderNext() {
  const map = state.day.map;
  const next = getNode(map, map.nextStepId);
  const selected = getNode(map, state.selectedId) || next;

  if (!next) {
    $("#nextTitle").textContent = map.nodes?.length ? "All clear — map again or add more" : "No steps yet";
    $("#nextHint").textContent = "Dump more thoughts to find a next move.";
    $("#markDone").disabled = true;
    return;
  }

  $("#markDone").disabled = false;
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
    $("#nextHint").textContent = `Selected: ${typeLabel(selected.type)} · next stays highlighted on the map`;
  }
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

function nodeColors(type, isNext) {
  if (isNext) return { fill: "rgba(232, 168, 88, 0.35)", stroke: "#c47a2a" };
  switch (type) {
    case "root":
      return { fill: "rgba(26, 58, 64, 0.92)", stroke: "#1a3a40" };
    case "goal":
    case "theme":
      return { fill: "rgba(238, 246, 244, 0.95)", stroke: "#1a3a40" };
    case "action":
      return { fill: "rgba(255, 255, 255, 0.92)", stroke: "#2f6a6e" };
    case "blocker":
      return { fill: "rgba(138, 59, 44, 0.12)", stroke: "#8a3b2c" };
    default:
      return { fill: "rgba(255, 255, 255, 0.75)", stroke: "#5a6e72" };
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

  const edgeEls = edges
    .map((e) => {
      const midX = (e.x1 + e.x2) / 2;
      const midY = (e.y1 + e.y2) / 2;
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const cx = midX - dy * 0.08;
      const cy = midY + dx * 0.08;
      return `<path class="mm-edge ${e.isNext ? "is-next" : ""}" d="M ${e.x1} ${e.y1} Q ${cx} ${cy} ${e.x2} ${e.y2}" />`;
    })
    .join("");

  const nodeEls = nodes
    .map((n) => {
      const isRoot = n.type === "root";
      const w = isRoot ? 150 : n.type === "goal" || n.type === "theme" ? 132 : 118;
      const lines = wrapLabel(n.label, isRoot ? 16 : 15);
      const h = 28 + lines.length * 14 + (isRoot ? 4 : 12);
      const colors = nodeColors(n.type, n.isNext);
      const textFill = isRoot ? "#f7f4ee" : "#142428";
      const chipFill = isRoot ? "rgba(247,244,238,0.7)" : undefined;
      const labelY = isRoot ? -((lines.length - 1) * 7) : -((lines.length - 1) * 7) + 4;
      const label = lines
        .map(
          (line, li) =>
            `<tspan x="0" dy="${li === 0 ? 0 : 14}">${escapeHtml(line)}</tspan>`
        )
        .join("");
      const chip = isRoot
        ? ""
        : `<text class="chip" y="${-h / 2 + 12}" text-anchor="middle" fill="${chipFill || ""}">${typeLabel(n.type)}</text>`;

      return `
        <g class="mm-node ${isRoot ? "is-root" : ""} ${n.isNext ? "is-next" : ""} ${n.done ? "is-done" : ""} ${state.selectedId === n.id ? "is-selected" : ""}"
           data-id="${n.id}"
           transform="translate(${n.x}, ${n.y})">
          <rect class="bubble" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="14"
            fill="${colors.fill}" stroke="${colors.stroke}" />
          ${chip}
          <text class="label" y="${labelY}" text-anchor="middle" fill="${textFill}">${label}</text>
        </g>`;
    })
    .join("");

  svg.innerHTML = `
    <g id="viewport" transform="translate(${vx}, ${vy}) scale(${scale})">
      <g id="world">${edgeEls}${nodeEls}</g>
    </g>`;

  // Center world in view on first paint if view is identity-ish
  fitIfNeeded();

  svg.querySelectorAll(".mm-node").forEach((el) => {
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const id = el.getAttribute("data-id");
      state.selectedId = id;
      // Promote selected action/blocker to next step when clicked
      const node = getNode(map, id);
      if (node && (node.type === "action" || node.type === "blocker") && !node.done) {
        map.nextStepId = id;
        persist();
      }
      renderMap();
      renderNext();
    });
  });
}

function fitIfNeeded() {
  const svg = $("#mindmap");
  const wrap = $("#canvasWrap");
  if (!state.layout || !wrap) return;

  // Only auto-center when scale is default and view hasn't been panned much
  if (Math.abs(state.view.x) > 2 || Math.abs(state.view.y) > 2 || Math.abs(state.view.scale - 1) > 0.02) {
    applyView();
    return;
  }

  const rect = wrap.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  state.view.x = cx;
  state.view.y = cy;
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
  // Zoom toward canvas center
  state.view.x = cx - ((cx - state.view.x) / before) * next;
  state.view.y = cy - ((cy - state.view.y) / before) * next;
  state.view.scale = next;
  applyView();
}

function onPointerDown(e) {
  if (e.target.closest?.(".mm-node") || e.target.closest?.(".tool")) return;
  state.dragging = true;
  state.lastPtr = { x: e.clientX, y: e.clientY };
  $("#canvasWrap").classList.add("is-panning");
  $("#canvasWrap").setPointerCapture?.(e.pointerId);
}

function onPointerMove(e) {
  if (!state.dragging || !state.lastPtr) return;
  const dx = e.clientX - state.lastPtr.x;
  const dy = e.clientY - state.lastPtr.y;
  state.view.x += dx;
  state.view.y += dy;
  state.lastPtr = { x: e.clientX, y: e.clientY };
  applyView();
}

function onPointerUp() {
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

init();
