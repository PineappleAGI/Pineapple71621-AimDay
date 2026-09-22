import { uid, thoughtKey } from "./util.js";
import {
  parseTime,
  isSomeday,
  isRecurring,
  stackHint,
  inferContext,
  inferPriority,
} from "./signals.js";
import { pickNextStep } from "./priority.js";

export { thoughtKey };
export { pickNextStep, explainNext, focusLoad, ACTIVE_CAP, capWarning } from "./priority.js";

const GOAL_RE =
  /^(i want|i'd like|i would like|i need|i hope|i wish|my goal|goal[:\s]|aiming to|trying to|planning to)\b/i;
const WANT_INLINE_RE = /\b(my goal is|goal is to|i want to|i need to)\b/i;
const ACTION_RE =
  /^(do|make|build|write|send|call|email|fix|ship|finish|start|open|buy|book|schedule|review|read|draft|design|code|deploy|submit|meet|ask|reply|check|clean|organize|plan|outline|research|learn|practice|update|create|add|remove|test|push|pull|merge|publish|prepare|set up|setup|follow up|follow-up|get|put|find|look|pick|sort|move|run|try|talk|message|text|post|share|invite|confirm|be|go|head|arrive|attend|join)\b/i;
const NEED_ACTION_RE = /^(need to|have to|gotta|should|must|want to)\b/i;
const BLOCKER_RE =
  /\b(can't|cannot|blocked|waiting|stuck|depends on|need (?:help|from)|until|blocker|frustrated|overwhelmed)\b/i;
const NEXT_RE = /\b(next|first|asap|today|now|immediately|start with|begin with)\b/i;
const THEME_SPLIT_RE =
  /^(also|plus|and then|meanwhile|separately|on the side|personally|work|life|home|health|money|career)\b[:\-]?\s*/i;

/**
 * Split raw dump into atomic thought lines.
 */
export function splitThoughts(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const lines = [];
  for (const chunk of text.split(/\n+/)) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // Bullets / numbered lists → one item each
    if (/^([-*•]|\d+[.)])\s+/.test(trimmed) || trimmed.includes("\n")) {
      lines.push(cleanLine(trimmed.replace(/^([-*•]|\d+[.)])\s+/, "")));
      continue;
    }

    // Inline bullets separated by ; or ·
    if (/[;·|]/.test(trimmed) && trimmed.length > 40) {
      const parts = trimmed
        .split(/\s*[;·|]\s*/)
        .map(cleanLine)
        .filter(Boolean);
      if (parts.length > 1) {
        lines.push(...parts);
        continue;
      }
    }

    // Long paragraph → soft sentence split, keep short ones whole
    if (trimmed.length > 110) {
      const sentences = trimmed
        .split(/(?<=[.!?])\s+(?=[A-Z"'])|(?:\s+[-–—]\s+)/)
        .map(cleanLine)
        .filter((s) => s.length > 2);
      if (sentences.length > 1) {
        lines.push(...sentences);
        continue;
      }
    }

    lines.push(cleanLine(trimmed));
  }

  return [...new Set(lines.filter(Boolean))];
}

function cleanLine(s) {
  return s
    .replace(/^([-*•]|\d+[.)])\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.{2,}$/g, "")
    .replace(/\.$/g, "");
}

/**
 * Classify a thought fragment.
 */
export function classifyThought(text) {
  const t = text.trim();
  const lower = t.toLowerCase();

  if (BLOCKER_RE.test(lower)) return "blocker";
  // Open loops stay out of Want. Want is only explicit intent, not the default.
  if (isSomeday(t)) return "someday";
  if (GOAL_RE.test(t) || WANT_INLINE_RE.test(lower)) return "goal";
  if (NEED_ACTION_RE.test(t) || ACTION_RE.test(t) || NEXT_RE.test(lower)) return "action";
  if (stackHint(t) && /\b(send|write|email|draft|make|do|start|finish|review|submit|ship|read|ask|reply|text|message|book|buy|update|prepare)\b/i.test(t)) {
    return "action";
  }
  if (/^(maybe|perhaps|wonder|thinking|idea|note)\b/i.test(t)) return "note";
  if (t.length < 70 && !/\?$/.test(t) && ACTION_RE.test(t)) return "action";
  if (parseTime(t) && t.length < 80) return "action";
  return "note";
}

/**
 * Turn a raw thought dump into a mindmap tree + suggested next step.
 */
export function thoughtsToMap(raw) {
  const lines = splitThoughts(raw);
  if (!lines.length) {
    return emptyMap();
  }

  const rootId = uid();
  const nodes = [];

  const goals = [];

  let currentTheme = null;

  for (const line of lines) {
    let text = line;
    const themeMatch = text.match(THEME_SPLIT_RE);
    if (themeMatch) {
      text = text.slice(themeMatch[0].length).trim() || text;
    }

    const type = classifyThought(text);
    const node = stampNewNode(text, type, rootId);

    if (type === "goal") {
      goals.push(node);
      currentTheme = node;
      nodes.push(node);
    } else if (type === "someday") {
      nodes.push(node);
    } else if (type === "action" || type === "blocker") {
      if (currentTheme) node.parentId = currentTheme.id;
      nodes.push(node);
    } else if (currentTheme) {
      node.parentId = currentTheme.id;
      nodes.push(node);
    } else {
      // A leading note can group what follows. It becomes a Theme, never a Want.
      node.type = "theme";
      applyInferred(node);
      node.originType = "theme";
      nodes.push(node);
      currentTheme = node;
      goals.push(node);
    }
  }

  // Without an explicit Want, keep Dos as Dos. Only a leading note becomes a Theme.
  const goalLike = nodes.filter((n) => n.type === "goal" || n.type === "theme");
  if (!goalLike.length) {
    const branches = nodes.filter((n) => n.parentId === rootId && n.type !== "someday");
    if (branches.length >= 2 && branches[0].type === "note") {
      const primary = branches[0];
      primary.type = "theme";
      applyInferred(primary);
      primary.originType = "theme";
      for (let i = 1; i < branches.length; i++) {
        if (branches[i].type === "action" && branches[i].label.length < 50) {
          branches[i].parentId = primary.id;
        }
      }
    }
  }

  // Re-parent lone actions under nearest preceding goal when still on root with many siblings
  const rootChildren = nodes.filter((n) => n.parentId === rootId);
  const goalNodes = rootChildren.filter((n) => n.type === "goal" || n.type === "theme");
  if (goalNodes.length === 1) {
    const g = goalNodes[0];
    for (const n of rootChildren) {
      if (n.id !== g.id && (n.type === "action" || n.type === "blocker" || n.type === "note")) {
        n.parentId = g.id;
      }
    }
  }

  resolveStacks(nodes);
  const rootLabel = inferRootLabel(lines, nodes);
  const nextStepId = pickNextStep(nodes);

  return {
    root: { id: rootId, label: rootLabel, type: "root" },
    nodes,
    nextStepId,
    raw,
  };
}

function inferRootLabel(lines, nodes) {
  const goal = nodes.find((n) => n.type === "goal");
  if (goal) {
    const g = goal.full || goal.label;
    const cleaned = g
      .replace(/^(i want to|i'd like to|i would like to|i need to|want to|need to|my goal is to|goal is to|aiming to|trying to|planning to)\s+/i, "")
      .trim();
    if (cleaned.length > 3) return shorten(cleaned, 48);
  }
  if (lines[0]) return shorten(lines[0], 48);
  return "My focus";
}

function stampNewNode(text, type, rootId) {
  const node = {
    id: uid(),
    label: shorten(text, 72),
    full: text,
    type,
    parentId: rootId,
    done: false,
    reward: false,
    identity: "",
    stackAfterId: null,
    stackAfterKey: null,
    stackManual: false,
    routineManual: false,
    priorityManual: false,
    contextManual: false,
    timeManual: false,
    becameDo: false,
    originType: type,
  };
  applyInferred(node);
  return node;
}

function applyInferred(node) {
  const text = node.full || node.label || "";
  if (!node.timeManual) {
    const time = parseTime(text);
    node.timeMinutes = time ? time.minutes : null;
    node.timeLabel = time ? time.label : null;
  }
  if (!node.contextManual) node.context = inferContext(text);
  if (!node.routineManual) node.recurring = isRecurring(text) || Boolean(stackHint(text));
  if (!node.priorityManual) {
    const priority = inferPriority(text, node.type);
    node.urgent = priority.urgent;
    node.important = priority.important;
  }
}

/** Re-read signals from the label after an edit, keeping manual overrides. */
export function annotateNode(node) {
  applyInferred(node);
  return node;
}

export function applyNodeType(node, type) {
  if ((node.originType === "goal" || node.type === "goal") && type === "action") node.becameDo = true;
  if (type !== "action") node.becameDo = node.originType === "goal" && type === "action";
  node.type = type;
  node.manualType = type;
  if (!node.priorityManual) {
    const priority = inferPriority(node.full || node.label, type);
    node.urgent = priority.urgent;
    node.important = priority.important;
  }
  return node;
}

export function resolveStacks(nodes) {
  const list = nodes || [];
  for (const node of list) {
    if (node.stackManual) {
      const target = node.stackAfterKey
        ? list.find(
            (other) =>
              other.id !== node.id && thoughtKey(other.full || other.label) === node.stackAfterKey
          )
        : null;
      node.stackAfterId = target?.id || null;
      continue;
    }

    const hint = stackHint(node.full || node.label);
    const target = hint ? matchRoutine(list, node, hint) : null;
    if (!target) {
      node.stackAfterId = null;
      node.stackAfterKey = null;
      continue;
    }
    node.stackAfterId = target.id;
    node.stackAfterKey = thoughtKey(target.full || target.label);
    if (!target.routineManual) target.recurring = true;
  }
  return list;
}

function matchRoutine(nodes, self, hint) {
  const key = thoughtKey(hint);
  if (!key) return null;
  const ranked = nodes
    .filter((node) => node.id !== self.id)
    .map((node) => ({ node, key: thoughtKey(node.full || node.label) }))
    .filter((row) => row.key && (row.key.includes(key) || key.includes(row.key)));
  ranked.sort(
    (a, b) => Number(!!b.node.recurring) - Number(!!a.node.recurring) || b.key.length - a.key.length
  );
  return ranked[0]?.node || null;
}

export function emptyMap() {
  const rootId = uid();
  return {
    root: { id: rootId, label: "My focus", type: "root" },
    nodes: [],
    nextStepId: null,
    raw: "",
  };
}

export function shorten(text, max = 56) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trim()}…`;
}

export function getNode(map, id) {
  if (!map) return null;
  if (map.root?.id === id) return map.root;
  return (map.nodes || []).find((n) => n.id === id) || null;
}

export function childrenOf(map, parentId) {
  return (map.nodes || []).filter((n) => n.parentId === parentId);
}

/**
 * Remove one mapped node. Children move up to its parent.
 * Returns false when the id is missing or is the root.
 */
export function removeNode(map, id) {
  if (!map?.nodes || !id || id === map.root?.id) return false;
  const node = map.nodes.find((item) => item.id === id);
  if (!node) return false;

  const fallbackParent = node.parentId || map.root?.id;
  const parent = getNode(map, fallbackParent);
  const parentKey = fallbackParent === map.root?.id ? "root" : parent?.full || parent?.label || "root";

  for (const other of map.nodes) {
    if (other.id === id) continue;
    if (other.parentId === id) {
      other.parentId = fallbackParent;
      other.manualParent = parentKey;
    }
    if (other.stackAfterId === id || other.stackAfterKey === thoughtKey(node.full || node.label)) {
      other.stackAfterId = null;
      other.stackAfterKey = null;
      other.stackManual = true;
    }
  }

  map.nodes = map.nodes.filter((item) => item.id !== id);
  if (map.nextStepId === id || !map.nodes.some((item) => item.id === map.nextStepId && !item.done)) {
    map.nextStepId = pickNextStep(map.nodes);
  }
  return true;
}

export function progress(map) {
  const items = (map?.nodes || []).filter((n) => n.type === "action" || n.type === "blocker");
  if (!items.length) {
    const all = map?.nodes || [];
    if (!all.length) return { done: 0, total: 0, pct: 0 };
    const done = all.filter((n) => n.done).length;
    return { done, total: all.length, pct: Math.round((done / all.length) * 100) };
  }
  const done = items.filter((n) => n.done).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}

export function typeCounts(map) {
  const counts = { goal: 0, theme: 0, action: 0, blocker: 0, note: 0, someday: 0 };
  for (const n of map?.nodes || []) {
    if (counts[n.type] != null) counts[n.type] += 1;
  }
  return counts;
}

/**
 * Carry done flags, manual types, priority, and next-step choice onto a freshly parsed map.
 */
export function mergeMapState(prevMap, nextMap) {
  if (!nextMap) return nextMap;
  if (!prevMap?.nodes?.length) return nextMap;

  const prevByKey = new Map();
  for (const n of prevMap.nodes) {
    prevByKey.set(thoughtKey(n.full || n.label), n);
  }

  for (const n of nextMap.nodes) {
    const prev = prevByKey.get(thoughtKey(n.full || n.label));
    if (!prev) continue;
    carryNode(prev, n, nextMap);
  }

  resolveStacks(nextMap.nodes);

  const prevNext = getNode(prevMap, prevMap.nextStepId);
  if (prevNext) {
    const match = nextMap.nodes.find(
      (n) => thoughtKey(n.full || n.label) === thoughtKey(prevNext.full || prevNext.label) && !n.done
    );
    if (match) nextMap.nextStepId = match.id;
  }

  const current = getNode(nextMap, nextMap.nextStepId);
  if (!current || current.done) {
    nextMap.nextStepId = pickNextStep(nextMap.nodes);
  }

  return nextMap;
}

function carryNode(prev, node, nextMap) {
  node.done = !!prev.done;
  node.reward = !!prev.reward;
  node.identity = prev.identity || "";
  node.originType = prev.originType || node.originType;
  node.becameDo = !!prev.becameDo;

  if (prev.manualType) {
    node.type = prev.manualType;
    node.manualType = prev.manualType;
  }
  if (node.originType === "goal" && node.type === "action") node.becameDo = true;

  if (prev.priorityManual) {
    node.urgent = !!prev.urgent;
    node.important = !!prev.important;
    node.priorityManual = true;
  }
  if (prev.contextManual) {
    node.context = prev.context || null;
    node.contextManual = true;
  }
  if (prev.routineManual) {
    node.recurring = !!prev.recurring;
    node.routineManual = true;
  }
  if (prev.timeManual) {
    node.timeMinutes = Number.isFinite(prev.timeMinutes) ? prev.timeMinutes : null;
    node.timeLabel = prev.timeLabel || null;
    node.timeManual = true;
  }
  if (prev.stackManual) {
    node.stackManual = true;
    node.stackAfterKey = prev.stackAfterKey || null;
  }

  if (prev.manualParent && prev.manualParent !== "root") {
    const parentMatch = nextMap.nodes.find(
      (p) => thoughtKey(p.full || p.label) === thoughtKey(prev.manualParent)
    );
    if (parentMatch) {
      node.parentId = parentMatch.id;
      node.manualParent = prev.manualParent;
    }
  } else if (prev.manualParent === "root") {
    node.parentId = nextMap.root.id;
    node.manualParent = "root";
  }
}

/** Ancestor chain from root → target (inclusive). */
export function pathToNode(map, targetId) {
  const ids = new Set();
  if (!map || !targetId) return ids;
  if (map.root?.id) ids.add(map.root.id);
  let cur = getNode(map, targetId);
  while (cur) {
    ids.add(cur.id);
    if (!cur.parentId || cur.id === map.root?.id) break;
    cur = getNode(map, cur.parentId);
  }
  return ids;
}

export function remapThoughts(raw, prevMap) {
  return mergeMapState(prevMap, thoughtsToMap(raw));
}
