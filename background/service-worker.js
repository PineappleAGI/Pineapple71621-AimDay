import { getSettings } from "../shared/storage.js";

const MORNING_ALARM = "aimday-morning";
const NOTIFY_ID = "aimday-morning-nudge";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
ensureMorningAlarm().catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await ensureMorningAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureMorningAlarm();
  const settings = await getSettings();
  if (!settings.openOnStartup) return;
  const url = chrome.runtime.getURL("dashboard/dashboard.html");
  await openDashboard(url);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== MORNING_ALARM) return;
  const settings = await getSettings();
  if (!settings.morningNotify) return;

  await chrome.notifications.create(NOTIFY_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title: "AimDay",
    message: "What’s today’s next step?",
    priority: 1,
  });
});

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== NOTIFY_ID) return;
  await chrome.notifications.clear(NOTIFY_ID);
  const url = chrome.runtime.getURL("dashboard/dashboard.html?focus=capture");
  await openDashboard(url);
});

async function ensureMorningAlarm() {
  await chrome.alarms.create(MORNING_ALARM, {
    when: nextMorningMs(),
    periodInMinutes: 24 * 60,
  });
}

async function openDashboard(url) {
  const baseUrl = url.split("?")[0];
  const existing = await chrome.tabs.query({ url: `${baseUrl}*` });
  if (existing.length) {
    const tab = existing[0];
    await chrome.tabs.update(tab.id, { active: true, url });
    if (tab.windowId != null) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return;
  }

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  if (windows.length) {
    const target = windows.find((w) => w.focused) || windows[0];
    await chrome.tabs.create({ url, windowId: target.id });
    return;
  }

  await chrome.windows.create({ url, focused: true, type: "normal" });
}

function nextMorningMs() {
  const now = new Date();
  const next = new Date();
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
