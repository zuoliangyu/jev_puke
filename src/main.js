import { $ } from "./core/dom.js";
import { loadSettings, saveSettings } from "./core/settings.js";
import { state } from "./core/state.js";
import { loadApiStatus } from "./api/jev.js";
import { deal, resetView, runPhaseTurn } from "./game/engine.js";
import { log, resetScore, syncNames } from "./ui/render.js";

$("#deal").addEventListener("click", () => {
  resetView();
  deal();
});

$("#step").addEventListener("click", () => {
  if (!state.playing) deal();
  else runPhaseTurn();
});

$("#auto").addEventListener("click", () => {
  const wasPlaying = state.playing;
  if (!wasPlaying) deal();
  state.auto = true;
  $("#auto").hidden = true;
  $("#pause").hidden = false;
  log("<b>自动播放</b> · 叫分与出牌会连续推进", "wait");
  if (wasPlaying) state.timer = setTimeout(runPhaseTurn, 650);
});

$("#pause").addEventListener("click", () => {
  state.auto = false;
  clearTimeout(state.timer);
  $("#auto").hidden = false;
  $("#pause").hidden = true;
  log("<b>已暂停</b> · 可手动推进下一步", "wait");
});

$("#reset").addEventListener("click", resetView);
$("#clear").addEventListener("click", () => {
  state.logs = [];
  $("#log").innerHTML = "<p>日志已清空</p>";
});

$("#configToggle").addEventListener("click", () => {
  const body = $("#config");
  const toggle = $("#configToggle");
  const open = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!open));
  body.hidden = open;
  toggle.querySelector("b").textContent = open ? "+" : "−";
});

$("#saveSettings").addEventListener("click", () => {
  const status = $("#settingsStatus");
  const saved = saveSettings();
  status.textContent = saved
    ? "已保存 · API Key 仅当前页面"
    : "保存失败 · 浏览器禁止本地存储";
  status.className = saved ? "saved" : "error";
  window.setTimeout(() => {
    status.textContent = "";
    status.className = "";
  }, 3200);
});

$("#session").textContent =
  "LOCAL-" + Math.random().toString(36).slice(2, 6).toUpperCase();

["northName", "westName", "eastName"].forEach((id) =>
  $("#" + id).addEventListener("input", syncNames),
);

$("#baseScore")?.addEventListener("input", () => {
  if (state.phase === "ready") resetScore();
});

loadSettings();
syncNames();
resetView();
loadApiStatus();

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    if (!state.playing) deal();
    else runPhaseTurn();
  }
});
