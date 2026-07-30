import { uid } from "./util.js";

const GOAL_RE =
  /^(i want|i'd like|i would like|i need|i hope|i wish|my goal|goal[:\s]|aiming to|trying to|planning to|someday|eventually)\b/i;
const WANT_INLINE_RE = /\b(my goal is|goal is to|i want to|i need to)\b/i;
const ACTION_RE =
  /^(do|make|build|write|send|call|email|fix|ship|finish|start|open|buy|book|schedule|review|read|draft|design|code|deploy|submit|meet|ask|reply|check|clean|organize|plan|outline|research|learn|practice|update|create|add|remove|test|push|pull|merge|publish|prepare|set up|setup|follow up|follow-up|get|put|find|look|pick|sort|move|run|try|talk|message|text|post|share|invite|confirm)\b/i;
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
  if (GOAL_RE.test(t) || WANT_INLINE_RE.test(lower)) return "goal";
  if (NEED_ACTION_RE.test(t) || ACTION_RE.test(t) || NEXT_RE.test(lower)) return "action";
  if (/^(maybe|perhaps|wonder|thinking|idea|note)\b/i.test(t)) return "note";
  // Short imperative-ish lines
  if (t.length < 70 && !/\?$/.test(t) && ACTION_RE.test(t)) return "action";
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
    const node = {
      id: uid(),
      label: shorten(text, 72),
      full: text,
      type,
      parentId: rootId,
      done: false,
    };

    if (type === "goal") {
      goals.push(node);
      currentTheme = node;
      nodes.push(node);
    } else if (type === "action" || type === "blocker") {
      if (currentTheme) {
        node.parentId = currentTheme.id;
      }
      nodes.push(node);
    } else {
      // notes: attach to current goal if any, else hang under root as theme-ish
      if (currentTheme) {
        node.parentId = currentTheme.id;
        nodes.push(node);
      } else {
        node.type = "theme";
        nodes.push(node);
        currentTheme = node;
        goals.push(node);
      }
    }
  }

  // If no explicit goals, promote first substantial notes into branches
  const goalLike = nodes.filter((n) => n.type === "goal" || n.type === "theme");
  if (!goalLike.length) {
    const branches = nodes.filter((n) => n.parentId === rootId);
    // Cluster: first action/note becomes a theme container
    if (branches.length >= 2) {
      const primary = branches[0];
      primary.type = primary.type === "action" ? "goal" : "theme";
      for (let i = 1; i < branches.length; i++) {
        // Keep some as siblings; attach short actions under primary
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

/**
 * Prefer: explicit "next/today/first" actions → unfinished actions → unfinished blockers to unblock.
 */
export function pickNextStep(nodes) {
  const open = nodes.filter((n) => !n.done);
  const scored = open
    .filter((n) => n.type === "action" || n.type === "blocker")
    .map((n) => {
      let score = 0;
      const t = (n.full || n.label).toLowerCase();
      if (n.type === "action") score += 10;
      if (NEXT_RE.test(t)) score += 20;
      if (/\btoday\b|\bnow\b|\basap\b/.test(t)) score += 15;
      if (n.type === "blocker") score += 6;
      // Prefer concrete short actions
      if (n.label.length < 55) score += 3;
      if (ACTION_RE.test(n.label)) score += 4;
      return { id: n.id, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length) return scored[0].id;

  const note = open.find((n) => n.type === "note" || n.type === "theme");
  return note?.id || open[0]?.id || null;
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
