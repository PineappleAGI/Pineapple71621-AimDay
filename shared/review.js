import { ACTIVE_CAP, focusLoad } from "./priority.js";
import { thoughtKey } from "./util.js";

/**
 * Systems-over-goals rollup for the last few stored days.
 * `days` are AimDay day records ({ date, map }).
 */
export function rollupWeek(days) {
  const records = (days || []).filter((day) => day?.map);
  let wantsBecameDos = 0;
  let rewards = 0;
  let done = 0;
  let overCapDays = 0;
  const blockerDays = new Map();

  for (const day of records) {
    const nodes = day.map.nodes || [];
    const load = focusLoad(nodes);
    if (load.over > 0) overCapDays += 1;

    for (const node of nodes) {
      if (node.becameDo || (node.originType === "goal" && node.type === "action")) {
        wantsBecameDos += 1;
      }
      if (node.reward) rewards += 1;
      if (node.done && (node.type === "action" || node.type === "blocker" || node.type === "goal")) {
        done += 1;
      }
      if (node.type === "blocker") {
        const key = thoughtKey(node.full || node.label);
        if (!key) continue;
        const entry = blockerDays.get(key) || {
          label: node.full || node.label,
          days: new Set(),
        };
        entry.days.add(day.date);
        blockerDays.set(key, entry);
      }
    }
  }

  const recurringBlockers = [...blockerDays.values()].filter((entry) => entry.days.size >= 2);
  const insights = [];

  for (const entry of recurringBlockers) {
    const label = entry.label.replace(/\s+/g, " ").trim();
    insights.push({
      title: `${label} is always a Blocker`,
      fix: `It showed up on ${entry.days.size} days. Make it a routine, or remove the friction before it lands on the map.`,
    });
  }

  const openWants = records.reduce((sum, day) => {
    return sum + (day.map.nodes || []).filter((n) => n.type === "goal" && !n.done).length;
  }, 0);
  if (openWants >= 3 && wantsBecameDos === 0) {
    insights.push({
      title: "Wants are staying Wants",
      fix: "Pick one Want and turn it into a Do so the week has a move, not only a wish.",
    });
  }

  if (overCapDays >= 2) {
    insights.push({
      title: "The active list is over the cap",
      fix: `Ivy Lee caps active Wants and Dos at ${ACTIVE_CAP}. Park the rest in Someday/Maybe.`,
    });
  }

  if (!insights.length && records.length) {
    insights.push({
      title: "No repeating snag yet",
      fix: "Keep dumping for a few days. Recurring Blockers and stalled Wants will show up here.",
    });
  }

  return {
    days: records.length,
    wantsBecameDos,
    blockersRecurred: recurringBlockers.length,
    done,
    rewards,
    insights,
  };
}
