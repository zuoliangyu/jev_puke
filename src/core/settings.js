import { $ } from "./dom.js";

const STORAGE_KEY = "jev-landlords-settings-v1";
const FIELD_IDS = [
  "endpoint",
  "model",
  "baseScore",
  "northName",
  "westName",
  "eastName",
  "proxy",
];

function readSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function loadSettings() {
  const settings = readSettings();
  FIELD_IDS.forEach((id) => {
    const element = $("#" + id);
    if (element && typeof settings[id] === "string")
      element.value = settings[id];
  });
}

export function saveSettings() {
  const settings = Object.fromEntries(
    FIELD_IDS.map((id) => [id, $("#" + id)?.value ?? ""]),
  );
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}
