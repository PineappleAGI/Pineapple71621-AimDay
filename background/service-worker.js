import { getSettings } from "../shared/storage.js";

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

chrome.runtime.onStartup.addListener(async () => {
  const settings = await getSettings();
  if (!settings.openOnStartup) return;
  const url = chrome.runtime.getURL("dashboard/dashboard.html");
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    return;
  }
  await chrome.tabs.create({ url });
});

chrome.alarms.create("aimday-morning", {
  when: nextMorningMs(),
  periodInMinutes: 24 * 60,
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "aimday-morning") return;
  const settings = await getSettings();
  if (!settings.openOnStartup) return;
  const url = chrome.runtime.getURL("dashboard/dashboard.html?focus=capture");
  await chrome.tabs.create({ url });
});

function nextMorningMs() {
  const now = new Date();
  const next = new Date();
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}
