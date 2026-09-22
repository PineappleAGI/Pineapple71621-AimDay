/** Time, context, routine, and someday signals parsed from a thought line. */

const TIME_12_RE = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b/i;
const TIME_24_RE = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/;

const SOMEDAY_RE =
  /\b(someday|eventually|one day|maybe later|bucket list|would be nice|when i have time|pop-up|popup)\b/i;

const RECUR_RE =
  /\b(every day|everyday|daily|each morning|every morning|each night|every night|every week|weekly|routine|habit|always|call with|standup|stand-up|check-in|check in)\b/i;

const STACK_VERB_RE =
  /\s+\b(send|write|email|call|draft|make|do|start|finish|review|submit|ship|open|read|ask|reply|text|message|book|buy|update|prepare)\b(?!-)[\s\S]*$/i;

const CONTEXT_RULES = [
  { id: "@calls", re: /\b(call|phone|zoom|dial|ring|facetime)\b|@calls\b/i },
  { id: "@errand", re: /\b(errand|grocery|groceries|store|pick up|pickup|buy|post office|pharmacy)\b|@errand\b/i },
  { id: "@desk", re: /\b(email|draft|write|code|deck|spreadsheet|doc|slack|review|proposal|inbox)\b|@desk\b/i },
];

export function parseTime(text) {
  const raw = String(text || "");
  const twelve = raw.match(TIME_12_RE);
  if (twelve) {
    let hour = Number(twelve[1]);
    const minute = Number(twelve[2] || 0);
    const ap = twelve[3].toLowerCase();
    if (hour > 12 || minute > 59) return null;
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    if (hour > 23) return null;
    const minutes = hour * 60 + minute;
    return { minutes, label: formatClock(minutes), raw: twelve[0] };
  }

  const twentyFour = raw.match(TIME_24_RE);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return null;
    const minutes = hour * 60 + minute;
    return { minutes, label: formatClock(minutes), raw: twentyFour[0] };
  }
  return null;
}

export function formatClock(minutes) {
  const day = 24 * 60;
  const m = ((Math.round(minutes) % day) + day) % day;
  let hour = Math.floor(m / 60);
  const minute = m % 60;
  const ap = hour >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  if (minute === 0) return `${hour}${ap}`;
  return `${hour}:${String(minute).padStart(2, "0")}${ap}`;
}

export function replaceTime(text, minutes) {
  const label = formatClock(minutes);
  const raw = String(text || "").trim();
  if (TIME_12_RE.test(raw)) return raw.replace(TIME_12_RE, label).replace(/\s+/g, " ").trim();
  if (TIME_24_RE.test(raw)) return raw.replace(TIME_24_RE, label).replace(/\s+/g, " ").trim();
  if (!raw) return label;
  return `${raw} ${label}`;
}

export function clearTime(text) {
  return String(text || "")
    .replace(TIME_12_RE, "")
    .replace(TIME_24_RE, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

export function isSomeday(text) {
  return SOMEDAY_RE.test(String(text || ""));
}

export function isRecurring(text) {
  return RECUR_RE.test(String(text || ""));
}

/** Phrase a node should stack onto, e.g. "after morning check-in → send the notes". */
export function stackHint(text) {
  const match = String(text || "").match(/\bafter\s+(.+)$/i);
  if (!match) return null;
  let hint = match[1].split(/\s*(?:→|->|—|,|\.)\s*/)[0];
  hint = hint.replace(STACK_VERB_RE, "");
  hint = hint
    .replace(/\b(i|i'll|i’ve|then|the)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return hint.length > 2 ? hint : null;
}

export function inferContext(text) {
  const raw = String(text || "");
  const explicit = raw.match(/@(desk|calls|errand)\b/i);
  if (explicit) return `@${explicit[1].toLowerCase()}`;
  for (const rule of CONTEXT_RULES) {
    if (rule.re.test(raw)) return rule.id;
  }
  return null;
}

/**
 * Urgent / Important defaults from the line and its type.
 * User toggles set priorityManual and are kept across remaps.
 */
export function inferPriority(text, type) {
  const lower = String(text || "").toLowerCase();
  const timed = parseTime(text) != null;
  const soon = /\b(urgent|asap|now|immediately|today)\b/.test(lower);

  if (type === "someday") return { urgent: false, important: false };
  if (type === "note" || type === "theme") {
    return { urgent: soon, important: false };
  }
  if (type === "blocker") {
    return {
      important: true,
      urgent: soon || /\b(stuck|blocked|can't|cannot)\b/.test(lower),
    };
  }
  if (type === "goal") {
    return { important: true, urgent: soon };
  }
  return {
    urgent: soon || timed,
    important: timed || /\b(important|must|need to|have to)\b/.test(lower),
  };
}

export function snapMinutes(minutes, step = 15) {
  const day = 24 * 60;
  const wrapped = ((minutes % day) + day) % day;
  return Math.round(wrapped / step) * step % day;
}
