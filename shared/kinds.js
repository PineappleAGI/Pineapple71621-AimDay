/** Canonical type names and canvas colors. Labels are title case on purpose. */

export const TYPE_LABELS = {
  root: "Focus",
  goal: "Want",
  theme: "Theme",
  action: "Do",
  blocker: "Blocker",
  note: "Note",
  someday: "Someday/Maybe",
};

export const TYPE_ORDER = ["goal", "action", "blocker", "theme", "note", "someday"];

export function typeLabel(type) {
  return TYPE_LABELS[type] || type;
}

export const TYPE_COLORS = {
  root: { fill: "#fbf7ef", stroke: "#8aa4c4", accent: "#3b6ea5", ink: "#1c1915" },
  goal: { fill: "#d9e5f2", stroke: "#2a5280", accent: "#2a5280", ink: "#1c1915" },
  theme: { fill: "#f4e6c4", stroke: "#8a6a2f", accent: "#8a6a2f", ink: "#1c1915" },
  action: { fill: "#d7eadc", stroke: "#2f6a45", accent: "#2f6a45", ink: "#1c1915" },
  blocker: { fill: "#f6d9d2", stroke: "#8a3b2c", accent: "#8a3b2c", ink: "#1c1915" },
  note: { fill: "#efeae2", stroke: "#6a6358", accent: "#6a6358", ink: "#1c1915" },
  someday: { fill: "#e6e0f2", stroke: "#6b5b8a", accent: "#6b5b8a", ink: "#1c1915" },
};

export function colorsFor(type) {
  return TYPE_COLORS[type] || TYPE_COLORS.note;
}

/** Eisenhower quadrant → MoSCoW name. */
export function moscowLabel(urgent, important) {
  if (urgent && important) return "Must";
  if (important) return "Should";
  if (urgent) return "Could";
  return "Won't";
}

export const CONTEXTS = ["@desk", "@calls", "@errand"];
