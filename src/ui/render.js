import { ids, typeLabel } from "../core/constants.js";
import { $, esc, time } from "../core/dom.js";
import { state } from "../core/state.js";
import { cardRank, sorted } from "../game/cards.js";

export function readBaseScore() {
  const input = $("#baseScore");
  const value = Math.round(Number(input?.value) || 1);
  return Math.min(100, Math.max(1, value));
}

export function resetScore() {
  state.score = {
    base: readBaseScore(),
    bid: 0,
    multiplier: 1,
    bombs: 0,
    spring: 1,
    total: 0,
    deltas: {},
    winner: null,
  };
  renderScore();
}

export function renderScore() {
  const score = state.score || {};
  const total =
    score.total ||
    (score.base || 1) *
      (score.bid || 0) *
      (score.multiplier || 1) *
      (score.spring || 1);
  const set = (id, value) => {
    const element = $("#" + id);
    if (element) element.textContent = value;
  };

  set("baseScoreView", score.base || 1);
  set("bidScoreView", score.bid || "—");
  set("multiplierView", `×${score.multiplier || 1}`);
  set("scoreTotalView", total ? `${total} 分` : "—");

  const badge = $("#scoreBadge");
  if (badge)
    badge.textContent =
      state.phase === "done" && total
        ? `${total} 分`
        : `×${score.multiplier || 1}`;

  const result = $("#scoreResult");
  if (!result) return;
  if (state.phase === "done" && score.winner) {
    result.innerHTML =
      ids
        .map((id) => {
          const delta = Number(score.deltas[id] || 0);
          const sign = delta > 0 ? "+" : "";
          return `<div class="score-row"><span>${esc(state.players[id].name)}</span><b class="${delta > 0 ? "positive" : delta < 0 ? "negative" : ""}">${sign}${delta} 分</b></div>`;
        })
        .join("") +
      `<small>${esc(state.players[score.winner].name)}获胜 · ${score.base} 底分 × ${score.bid} 叫分 × ${score.multiplier} 倍率 × ${score.spring} 春天倍率</small>`;
  } else {
    result.innerHTML = "<p>牌局结束后显示三方得分变化</p>";
  }
}

export function log(message, kind = "") {
  const logElement = $("#log");
  const follow =
    !logElement ||
    logElement.scrollHeight - logElement.scrollTop - logElement.clientHeight <
      36;
  state.logs.push({ message, kind, time: time() });
  if (state.logs.length > 65) state.logs.shift();
  if (!logElement) return;

  logElement.innerHTML = state.logs
    .map(
      (entry) =>
        `<div class="entry ${entry.kind}"><time>${entry.time}</time><span>${entry.message}</span></div>`,
    )
    .join("");
  if (follow) logElement.scrollTop = logElement.scrollHeight;
}

export function syncNames() {
  [
    ["north", "northName"],
    ["west", "westName"],
    ["east", "eastName"],
  ].forEach(([id, input]) => {
    const value = $("#" + input)?.value.trim() || state.players[id].name;
    state.players[id].name = value;
    const nameElement = document.querySelector(
      `[data-player-name="${id}"] .name-text`,
    );
    if (nameElement) nameElement.textContent = value;
    const jevName = document.querySelector(`[data-jev="${id}"] small`);
    if (jevName) jevName.textContent = `JEV · ${value}`;
    const handElement = $("#" + id + "Hand");
    if (handElement) handElement.setAttribute("aria-label", `${value}明牌`);
  });
}

export function renderRoles() {
  ids.forEach((id) => {
    const role = $("#" + id + "Role");
    if (role)
      role.textContent = state.landlord
        ? id === state.landlord
          ? "地主"
          : "农民"
        : state.phase === "ready"
          ? "待定"
          : "叫分中";
  });
}

export function renderSeatScores() {
  ids.forEach((id) => {
    const total = $("#" + id + "TotalScore");
    const round = $("#" + id + "RoundScore");
    if (total) total.textContent = state.scoreTotals[id] || 0;
    const delta = Number(state.score?.deltas?.[id] || 0);
    if (round)
      round.textContent =
        state.phase === "done" && state.score?.winner
          ? delta > 0
            ? `+${delta}`
            : delta
          : "—";
  });
}

export function renderCounts() {
  Object.entries(state.players).forEach(([id, player]) => {
    const count = $("#" + id + "Count");
    if (count) count.textContent = player.hand.length;
  });
  renderRoles();
  renderSeatScores();
  renderScore();
  ids.forEach((id) => {
    const seat = document.querySelector(".seat." + id);
    if (seat)
      seat.classList.toggle(
        "active",
        state.playing && ids[state.current] === id,
      );
  });
  $("#turnStat").textContent =
    state.phase === "bid"
      ? `BID ${String(state.bidTurn || 0).padStart(2, "0")} / 03`
      : `${String(Math.min(state.turn || 0, 54)).padStart(2, "0")} / 54`;
  $("#turnUsage").textContent = String(state.turn || 0).padStart(2, "0");
}

export function renderFaceHands() {
  Object.entries(state.players).forEach(([id, player]) => {
    const element = $("#" + id + "Hand");
    if (!element) return;
    element.innerHTML = sorted(player.hand)
      .map(
        (card) =>
          `<span class="face-card ${/[♥♦]/.test(card) ? "red" : ""}">${esc(card)}</span>`,
      )
      .join("");
  });
}

export function renderHand() {
  const player = state.players.east;
  const hand = sorted(player.hand);
  $("#hand").innerHTML =
    hand
      .map(
        (card) =>
          `<span class="mini-card ${/[♥♦]/.test(card) ? "red" : ""}">${esc(card)}</span>`,
      )
      .join("") +
    `<small>${esc(player.name)}手牌 · ${player.hand.length} 张</small>`;
}

export function renderPlayed(play, id) {
  const cards = play?.cards || [];
  $("#played").querySelector(".played-cards").innerHTML = cards
    .map(
      (card) =>
        `<span class="card ${/[♥♦]/.test(card) ? "red" : ""}">${esc(card)}</span>`,
    )
    .join("");
  $("#played").querySelector("small").textContent = play
    ? `${state.players[id].name} · ${typeLabel?.[play.type] || play.type}`
    : "本回合出牌";
}

export function renderKitty() {
  const element = $("#kitty");
  if (!state.kitty.length || state.phase === "bid") {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  element.querySelector("div").innerHTML = state.kitty
    .map(
      (card) =>
        `<span class="card ${/[♥♦]/.test(card) ? "red" : ""}">${esc(card)}</span>`,
    )
    .join("");
}

export function fallbackJudgement(id) {
  const player = state.players[id];
  if (state.phase === "ready")
    return {
      action: "等待开始",
      play: "—",
      style: "—",
      risk: "—",
      confidence: "—",
    };
  return state.phase === "bid"
    ? {
        action: "等待叫分",
        play: "叫 1 / 2 / 3",
        style: "观察牌力",
        risk: "中风险",
        confidence: "—",
      }
    : {
        action: "等待出牌",
        play: player.hand.length
          ? `${cardRank(sorted(player.hand)[0])} · 单张`
          : "过牌",
        style: "保留牌型",
        risk: "中风险",
        confidence: "—",
      };
}

export function renderJevCards(data) {
  Object.entries(state.players).forEach(([id]) => {
    const answer = data?.[id] || fallbackJudgement(id);
    const card = document.querySelector(`[data-jev="${id}"]`);
    card.className =
      "jev-card " +
      (answer.risk === "低风险"
        ? "good"
        : answer.risk === "高风险"
          ? "warn"
          : "");
    card.querySelector(".jev-action").textContent = answer.action;
    card.querySelector(".pick-play").textContent =
      `打什么 · ${answer.play || "—"}`;
    card.querySelector(".pick-style").textContent =
      `打法 · ${answer.style || "—"}`;
    card.querySelector(".jev-risk").textContent =
      `${answer.risk} · ${answer.confidence || "—"}`;
  });
}

export function renderDecisionList(data) {
  $("#turnSummary").hidden = true;
  $("#decisionList").hidden = false;
  $("#decisionList").innerHTML = ids
    .map((id) => {
      const decision = data[id] || fallbackJudgement(id);
      const player = state.players[id];
      return `<div class="decision-row"><span class="badge ${player.color}">${player.name.slice(0, 1)}</span><div><b>${esc(player.name)}</b><small>${esc(decision.play || "—")} · ${esc(decision.style || "—")}</small></div><strong>${esc(decision.action || "等待判断")}</strong></div>`;
    })
    .join("");
}

export function renderPendingDecision() {
  $("#turnSummary").hidden = false;
  $("#decisionList").hidden = true;
  $("#turnSummary").innerHTML =
    "<i>✦</i><p>正在调用 Jev</p><small>三位玩家的判断请求已发出，等待响应。</small>";
}

export function renderRawAnswer(result, data) {
  const element = $("#rawAnswer");
  if (!element) return;
  const raw =
    result && Object.keys(result).length
      ? result
      : {
          answers: Object.fromEntries(
            ids.map((id) => [id, data?.[id] || fallbackJudgement(id)]),
          ),
        };
  element.textContent = JSON.stringify(raw, null, 2);
}

export function updatePhase() {
  const labels = { ready: "READY", bid: "BID", play: "LIVE", done: "DONE" };
  $("#gameStat").textContent = labels[state.phase] || "READY";
  $("#status").textContent = labels[state.phase] || "READY";
  $("#status").className =
    state.phase === "bid"
      ? "running"
      : state.phase === "play"
        ? "live"
        : state.phase === "done"
          ? "done"
          : "";
  $("#deal").textContent = state.phase === "ready" ? "✦ 开始牌局" : "重新发牌";
  $("#step").textContent =
    state.phase === "bid"
      ? "下一次叫分 →"
      : state.phase === "play"
        ? "下一回合 →"
        : state.phase === "done"
          ? "下一局 →"
          : "下一步 →";
}
