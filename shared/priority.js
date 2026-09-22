import { moscowLabel, typeLabel } from "./kinds.js";

/** Ivy Lee: rank-ordered focus, not an endless open list. */
export const ACTIVE_CAP = 6;

const NEXT_RE = /\b(next|first|asap|today|now|immediately|start with|begin with)\b/i;
const ACTION_RE =
  /^(do|make|build|write|send|call|email|fix|ship|finish|start|open|buy|book|schedule|review|read|draft|design|code|deploy|submit|meet|ask|reply|check|clean|organize|plan|outline|research|learn|practice|update|create|add|remove|test|push|pull|merge|publish|prepare|set up|setup|follow up|follow-up|get|put|find|look|pick|sort|move|run|try|talk|message|text|post|share|invite|confirm|be|go|head|arrive|attend|join)\b/i;

export function isWantOrDo(node) {
  return node && (node.type === "goal" || node.type === "action");
}

export function isParked(node) {
  return !node || node.type === "someday" || node.bucket === "someday";
}

/** Open Wants and Dos that still belong on today's list. */
export function rankedFocus(nodes) {
  return (nodes || [])
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => !n.done && isWantOrDo(n) && !isParked(n))
    .map(({ n, index }) => ({ n, index, score: scoreNode(n) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export function focusLoad(nodes) {
  const ranked = rankedFocus(nodes);
  const active = ranked.slice(0, ACTIVE_CAP);
  const parked = ranked.slice(ACTIVE_CAP);
  return {
    cap: ACTIVE_CAP,
    open: ranked.length,
    over: Math.max(0, ranked.length - ACTIVE_CAP),
    activeIds: new Set(active.map((row) => row.n.id)),
    parkedIds: new Set(parked.map((row) => row.n.id)),
  };
}

export function scoreNode(node) {
  if (!node || node.done || isParked(node)) return -100;
  const text = `${node.full || ""} ${node.label || ""}`;
  const lower = text.toLowerCase();
  let score = 0;

  if (node.type === "action") score += 12;
  else if (node.type === "blocker") score += 9;
  else if (node.type === "goal") score += 3;
  else score -= 6;

  if (node.urgent && node.important) score += 30;
  else if (node.important) score += 16;
  else if (node.urgent) score += 10;
  else score -= 4;

  if (NEXT_RE.test(lower)) score += 18;
  if (/\btoday\b|\bnow\b|\basap\b/.test(lower)) score += 12;
  if ((node.label || "").length > 0 && node.label.length < 55) score += 3;
  if (ACTION_RE.test(node.label || node.full || "")) score += 4;
  if (node.timeMinutes != null) score += timeNearness(node.timeMinutes);
  if (node.recurring) score += 2;

  return score;
}

function timeNearness(minutes) {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const delta = minutes - nowMins;
  if (delta < -90) return -2;
  if (delta <= 30) return 8;
  if (delta <= 120) return 5;
  return 1;
}

/**
 * Highest-scoring open move, using type and the Urgent/Important axis.
 * Wants and Dos past the Ivy Lee cap stay on the map but drop out of the pick.
 */
export function explainNext(nodes) {
  const list = nodes || [];
  const load = focusLoad(list);
  const pool = list
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => {
      if (n.done || isParked(n)) return false;
      if (n.type === "note" || n.type === "theme" || n.type === "root") return false;
      if (isWantOrDo(n) && load.parkedIds.has(n.id)) return false;
      return n.type === "action" || n.type === "blocker" || n.type === "goal";
    })
    .map(({ n, index }) => ({ n, index, score: scoreNode(n) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  if (!pool.length) {
    const fallback = list.find((n) => !n.done && (n.type === "note" || n.type === "theme"));
    return {
      id: fallback?.id || list.find((n) => !n.done)?.id || null,
      score: 0,
      reason: fallback ? "Nothing actionable is open." : "Map a thought to find a move.",
      over: load.over,
      cap: load.cap,
      open: load.open,
    };
  }

  const best = pool[0];
  return {
    id: best.n.id,
    score: best.score,
    reason: decisionReason(best.n, load),
    over: load.over,
    cap: load.cap,
    open: load.open,
  };
}

export function pickNextStep(nodes) {
  return explainNext(nodes).id;
}

export function decisionReason(node, load) {
  const moscow = moscowLabel(!!node.urgent, !!node.important);
  const kind = typeLabel(node.type);
  let why = `${moscow} · ${kind}`;
  if (node.urgent && node.important) why += ". Urgent and Important";
  else if (node.important) why += ". Important, not urgent";
  else if (node.urgent) why += ". Urgent, not important";
  else why += ". Not urgent or important";
  if (node.type === "blocker") why += " — clear this before it stalls the day";
  if (load?.over > 0) {
    why += `. ${load.open} active Wants and Dos is past the cap of ${load.cap}`;
  }
  return why;
}

export function capWarning(load) {
  if (!load || load.over <= 0) return "";
  return `${load.open} active Wants and Dos. Cap is ${load.cap} — park the rest in Someday/Maybe.`;
}
