import { emptyMap } from "./parse.js";

const SETTINGS_KEY = "aimday_settings";

function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayStorageKey(key = dateKey()) {
  return `aimday_day_${key}`;
}

export function emptyDay(key = dateKey()) {
  return {
    date: key,
    thoughts: "",
    map: emptyMap(),
    mapped: false,
    updatedAt: Date.now(),
  };
}

export async function getSettings() {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    openOnStartup: false,
    morningNotify: true,
    ...(data[SETTINGS_KEY] || {}),
  };
}

export async function saveSettings(partial) {
  const current = await getSettings();
  const next = { ...current, ...partial };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getDay(key = dateKey()) {
  const storageKey = dayStorageKey(key);
  const data = await chrome.storage.local.get(storageKey);
  const raw = data[storageKey];
  if (!raw) return emptyDay(key);
  // Migrate older AimDay day shape if present
  if (!raw.map && (raw.aim || raw.blocks)) {
    const thoughts = [raw.aim?.aim, raw.aim?.intention, ...(raw.tasks || []).map((t) => t.title)]
      .filter(Boolean)
      .join("\n");
    return {
      date: key,
      thoughts,
      map: emptyMap(),
      mapped: false,
      updatedAt: Date.now(),
    };
  }
  return {
    ...emptyDay(key),
    ...raw,
    map: raw.map || emptyMap(),
  };
}

export async function saveDay(day) {
  const key = day.date || dateKey();
  const next = { ...day, date: key, updatedAt: Date.now() };
  await chrome.storage.local.set({ [dayStorageKey(key)]: next });
  return next;
}

export function todayStorageKey() {
  return dayStorageKey(dateKey());
}

export { dateKey, dayStorageKey };
