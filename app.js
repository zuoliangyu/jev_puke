const $ = (s) => document.querySelector(s);
const state = {
  phase: "ready",
  playing: false,
  auto: false,
  timer: null,
  turn: 0,
  current: 0,
  kitty: [],
  bidHistory: [],
  bidTurn: 0,
  bidPasses: 0,
  highestBid: 0,
  highestBidder: null,
  landlord: null,
  lastPlay: null,
  passCount: 0,
  playedBy: { north: 0, west: 0, east: 0 },
  scoreTotals: { north: 0, west: 0, east: 0 },
  score: {
    base: 1,
    bid: 0,
    multiplier: 1,
    bombs: 0,
    spring: 1,
    total: 0,
    deltas: {},
    winner: null,
  },
  players: {
    north: { name: "左岚", color: "blue", hand: [] },
    west: { name: "小符", color: "yellow", hand: [] },
    east: { name: "长东", color: "red", hand: [] },
  },
  logs: [],
  apiReady: null,
};
const ids = ["north", "west", "east"],
  ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"],
  suits = ["♠", "♥", "♦", "♣"],
  rankValue = {
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 9,
    10: 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
    2: 15,
    小王: 16,
    大王: 17,
  };
function time() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function esc(v) {
  return String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function readBaseScore() {
  const input = $("#baseScore"),
    value = Math.round(Number(input?.value) || 1);
  return Math.min(100, Math.max(1, value));
}
function resetScore() {
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
function renderScore() {
  const s = state.score || {};
  const total =
    s.total ||
    (s.base || 1) * (s.bid || 0) * (s.multiplier || 1) * (s.spring || 1);
  const set = (id, value) => {
    const el = $("#" + id);
    if (el) el.textContent = value;
  };
  set("baseScoreView", s.base || 1);
  set("bidScoreView", s.bid || "—");
  set("multiplierView", `×${s.multiplier || 1}`);
  set("scoreTotalView", total ? `${total} 分` : "—");
  const badge = $("#scoreBadge");
  if (badge)
    badge.textContent =
      state.phase === "done" && total ? `${total} 分` : `×${s.multiplier || 1}`;
  const result = $("#scoreResult");
  if (!result) return;
  if (state.phase === "done" && s.winner) {
    result.innerHTML =
      ids
        .map((id) => {
          const delta = Number(s.deltas[id] || 0),
            sign = delta > 0 ? "+" : "";
          return `<div class="score-row"><span>${esc(state.players[id].name)}</span><b class="${delta > 0 ? "positive" : delta < 0 ? "negative" : ""}">${sign}${delta} 分</b></div>`;
        })
        .join("") +
      `<small>${esc(state.players[s.winner].name)}获胜 · ${s.base} 底分 × ${s.bid} 叫分 × ${s.multiplier} 倍率 × ${s.spring} 春天倍率</small>`;
  } else result.innerHTML = "<p>牌局结束后显示三方得分变化</p>";
}
function log(message, kind = "") {
  const logEl = $("#log"),
    follow =
      !logEl || logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 36;
  state.logs.push({ message, kind, time: time() });
  if (state.logs.length > 65) state.logs.shift();
  if (logEl) {
    logEl.innerHTML = state.logs
      .map(
        (x) =>
          `<div class="entry ${x.kind}"><time>${x.time}</time><span>${x.message}</span></div>`,
      )
      .join("");
    if (follow) logEl.scrollTop = logEl.scrollHeight;
  }
}
function shuffle(a) {
  for (let i = a.length - 1; i; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeDeck() {
  return shuffle([
    ...suits.flatMap((s) => ranks.map((r) => s + r)),
    "小王",
    "大王",
  ]);
}
function cardRank(card) {
  return card === "小王" || card === "大王" ? card : card.slice(1);
}
function rank(card) {
  return rankValue[cardRank(card)] || 0;
}
function sorted(hand) {
  return [...hand].sort((a, b) => rank(a) - rank(b));
}
function syncNames() {
  [
    ["north", "northName"],
    ["west", "westName"],
    ["east", "eastName"],
  ].forEach(([id, input]) => {
    const value = $("#" + input)?.value.trim() || state.players[id].name;
    state.players[id].name = value;
    const nameEl = document.querySelector(
      `[data-player-name="${id}"] .name-text`,
    );
    if (nameEl) nameEl.textContent = value;
    const jevName = document.querySelector(`[data-jev="${id}"] small`);
    if (jevName) jevName.textContent = `JEV · ${value}`;
    const handEl = $("#" + id + "Hand");
    if (handEl) handEl.setAttribute("aria-label", `${value}明牌`);
  });
}
function renderRoles() {
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
function renderSeatScores() {
  ids.forEach((id) => {
    const total = $("#" + id + "TotalScore"),
      round = $("#" + id + "RoundScore");
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
function renderCounts() {
  Object.entries(state.players).forEach(
    ([id, p]) => ($("#" + id + "Count").textContent = p.hand.length),
  );
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
function renderFaceHands() {
  Object.entries(state.players).forEach(([id, p]) => {
    const el = $("#" + id + "Hand");
    if (!el) return;
    el.innerHTML = sorted(p.hand)
      .map(
        (c) =>
          `<span class="face-card ${/[♥♦]/.test(c) ? "red" : ""}">${esc(c)}</span>`,
      )
      .join("");
  });
}
function renderHand() {
  const p = state.players.east,
    hand = sorted(p.hand);
  $("#hand").innerHTML =
    hand
      .map(
        (c) =>
          `<span class="mini-card ${/[♥♦]/.test(c) ? "red" : ""}">${esc(c)}</span>`,
      )
      .join("") + `<small>${esc(p.name)}手牌 · ${p.hand.length} 张</small>`;
}
function renderPlayed(play, id) {
  const cards = play?.cards || [];
  $("#played").querySelector(".played-cards").innerHTML = cards
    .map(
      (c) =>
        `<span class="card ${/[♥♦]/.test(c) ? "red" : ""}">${esc(c)}</span>`,
    )
    .join("");
  $("#played").querySelector("small").textContent = play
    ? `${state.players[id].name} · ${typeLabel?.[play.type] || play.type}`
    : "本回合出牌";
}
function renderKitty() {
  const el = $("#kitty");
  if (!state.kitty.length || state.phase === "bid") {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.querySelector("div").innerHTML = state.kitty
    .map(
      (c) =>
        `<span class="card ${/[♥♦]/.test(c) ? "red" : ""}">${esc(c)}</span>`,
    )
    .join("");
}
function fallbackJudgement(id) {
  const p = state.players[id];
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
        play: p.hand.length ? `${cardRank(sorted(p.hand)[0])} · 单张` : "过牌",
        style: "保留牌型",
        risk: "中风险",
        confidence: "—",
      };
}
function renderJevCards(data) {
  Object.entries(state.players).forEach(([id]) => {
    const answer = data?.[id] || fallbackJudgement(id),
      card = document.querySelector(`[data-jev="${id}"]`);
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
function renderDecisionList(data) {
  $("#turnSummary").hidden = true;
  $("#decisionList").hidden = false;
  $("#decisionList").innerHTML = ids
    .map((id) => {
      const d = data[id] || fallbackJudgement(id),
        p = state.players[id];
      return `<div class="decision-row"><span class="badge ${p.color}">${p.name.slice(0, 1)}</span><div><b>${esc(p.name)}</b><small>${esc(d.play || "—")} · ${esc(d.style || "—")}</small></div><strong>${esc(d.action || "等待判断")}</strong></div>`;
    })
    .join("");
}
function renderRawAnswer(result, data) {
  const el = $("#rawAnswer");
  if (!el) return;
  const raw =
    result && Object.keys(result).length
      ? result
      : {
          answers: Object.fromEntries(
            ids.map((id) => [id, data?.[id] || fallbackJudgement(id)]),
          ),
        };
  el.textContent = JSON.stringify(raw, null, 2);
}
function updatePhase() {
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
function resetView() {
  state.phase = "ready";
  state.playing = false;
  state.auto = false;
  clearTimeout(state.timer);
  state.turn = 0;
  state.current = 0;
  state.kitty = [];
  state.bidHistory = [];
  state.bidTurn = 0;
  state.bidPasses = 0;
  state.highestBid = 0;
  state.highestBidder = null;
  state.landlord = null;
  state.lastPlay = null;
  state.passCount = 0;
  ids.forEach((id) => {
    state.playedBy[id] = 0;
    state.scoreTotals[id] = 0;
  });
  Object.values(state.players).forEach((p) => (p.hand = []));
  resetScore();
  renderCounts();
  renderFaceHands();
  renderHand();
  renderPlayed();
  renderKitty();
  renderJevCards();
  updatePhase();
  $("#hint").textContent = "点击“开始牌局”";
  $("#roundLabel").textContent = "ROUND 01";
  $("#center").innerHTML =
    "<i>◇</i><b>等待发牌</b><small>JEV STRUCTURED TABLE</small>";
  $("#turnSummary").hidden = false;
  $("#decisionList").hidden = true;
  $("#turnSummary").innerHTML =
    "<i>✦</i><p>牌局还没有开始</p><small>发牌后先进入三人叫地主阶段。</small>";
  $("#log").innerHTML = "<p>尚无事件 · 牌局开始后将在这里展开</p>";
  state.logs = [];
}
function deal({ preserveLog = false, startTurn = true } = {}) {
  syncNames();
  const deck = makeDeck();
  ids.forEach((id, i) => {
    state.players[id].hand = deck.slice(i * 17, i * 17 + 17);
    state.playedBy[id] = 0;
  });
  state.kitty = deck.slice(51);
  Object.values(state.players).forEach((p) => (p.lastBid = 0));
  state.phase = "bid";
  state.playing = true;
  state.turn = 0;
  state.current = Math.floor(Math.random() * ids.length);
  state.bidHistory = [];
  state.bidTurn = 0;
  state.bidPasses = 0;
  state.highestBid = 0;
  state.highestBidder = null;
  state.landlord = null;
  state.lastPlay = null;
  state.passCount = 0;
  resetScore();
  if (!preserveLog) {
    state.logs = [];
    $("#log").innerHTML = "<p>牌局已初始化，等待叫分…</p>";
  }
  renderCounts();
  renderFaceHands();
  renderHand();
  renderKitty();
  updatePhase();
  $("#roundLabel").textContent = "BID 01";
  $("#hint").textContent =
    "三人轮流叫地主 · 当前：" + state.players[ids[state.current]].name;
  $("#center").innerHTML =
    "<i>♠</i><b>叫地主阶段</b><small>BIDDING / WHO TAKES THE KITTY</small>";
  log(
    `<b>发牌完成</b> · 三人明牌 · 底牌已扣下 · 由 ${esc(state.players[ids[state.current]].name)} 先叫`,
    "wait",
  );
  if (startTurn) runPhaseTurn();
}
function buildPayload() {
  const p = state.players;
  const last = state.lastPlay
    ? `${state.lastPlay.type} ${state.lastPlay.cards.join("")}`
    : "无";
  const stateText = `阶段：${state.phase === "bid" ? "叫地主" : "出牌"}。回合：${state.turn}。当前玩家：${p[ids[state.current]].name}。${p.north.name}/${p.west.name}/${p.east.name}的手牌数量：${p.north.hand.length}/${p.west.hand.length}/${p.east.hand.length}。最近动作：${last}。叫分记录：${state.bidHistory.map((x) => x.name + " " + x.bid).join("、") || "无"}。当前最高叫分：${state.highestBid || 0} 分；叫地主只能选择高于当前最高分的 1-3 分，或选择不叫。遵循斗地主牌型规则：单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二、炸弹、王炸。`;
  const questions = {};
  ids.forEach((id) => {
    const name = p[id].name;
    if (state.phase === "bid") {
      questions[`${id}_bid`] = {
        type: "choice",
        instructions: `判断${name}这轮是否应该叫地主及叫几分。当前最高叫分为 ${state.highestBid || 0} 分，只能叫更高分；牌力不足时选择不叫。`,
        criteria: {
          bid1: "叫 1 分，保守争取地主。",
          bid2: "叫 2 分，牌力较强。",
          bid3: "叫 3 分，牌力明显占优。",
          pass: "不叫，避免承担地主风险。",
        },
      };
    } else {
      questions[`${id}_play`] = {
        type: "choice",
        instructions: `判断${name}当前应该打什么牌型。`,
        criteria: {
          single: "单张或拆牌抢节奏。",
          pair: "对子或连续对子保持牌权。",
          triple: "三张、三带一或三带二。",
          straight: "顺子、连对或飞机快速清手。",
          bomb: "炸弹或王炸抢回牌权。",
          pass: "暂时过牌，等待更好机会。",
        },
      };
      questions[`${id}_style`] = {
        type: "choice",
        instructions: `判断${name}当前的进攻方式。`,
        criteria: {
          attack: "主动抢先手。",
          pressure: "压制对手出牌。",
          hold: "保留关键牌型。",
        },
      };
      questions[`${id}_risk`] = {
        type: "score",
        instructions: `评估${name}接下来两轮结束牌局的风险。`,
        criteria: ["低风险", "中风险", "高风险"],
      };
    }
  });
  return {
    model: $("#model").value.trim() || "jev-1.13",
    state: stateText,
    questions,
  };
}
function demoBidPlan() {
  const strength = (id) => {
    const hand = state.players[id].hand,
      groups = groupRanks(hand),
      counts = Object.values(groups);
    return (
      hand.reduce((sum, card) => sum + rank(card), 0) +
      counts.filter((c) => c >= 2).length * 4 +
      counts.filter((c) => c >= 3).length * 7 +
      counts.filter((c) => c === 4).length * 14 +
      (hand.includes("小王") && hand.includes("大王") ? 28 : 0)
    );
  };
  const ranked = ids
      .map((id) => ({ id, score: strength(id) }))
      .sort(
        (a, b) => b.score - a.score || ids.indexOf(a.id) - ids.indexOf(b.id),
      ),
    plan = {};
  ranked.forEach((item, index) => {
    plan[item.id] = index === 0 ? 3 : index === 1 ? 2 : 1;
  });
  return plan;
}
function demoJudgement() {
  const out = {};
  if (state.phase === "bid") {
    const plan = demoBidPlan(),
      id = ids[state.current],
      target = plan[id] || 0,
      bid = target > state.highestBid ? target : 0;
    ids.forEach((other) => {
      const current = other === id;
      out[other] = current
        ? {
            action: bid ? `叫 ${bid} 分` : "不叫",
            bid,
            play: bid ? `叫 ${bid} 分` : "不叫",
            style: bid === 3 ? "牌力强势" : bid === 2 ? "牌力较强" : "观察牌力",
            risk: bid === 3 ? "低风险" : "中风险",
            confidence: bid === 3 ? "84%" : bid === 2 ? "74%" : "62%",
          }
        : {
            action: "等待叫分",
            bid: null,
            play: "等待",
            style: "观察牌力",
            risk: "中风险",
            confidence: "—",
          };
    });
  } else {
    ids.forEach((id) => {
      const p = state.players[id],
        top = sorted(p.hand)[0],
        current = ids[state.current] === id;
      const play = current ? choosePlay(id) : null;
      out[id] = current
        ? {
            action: play.cards.length
              ? `出 ${typeLabel[play.type] || play.type}`
              : "过牌",
            play: play.cards.length ? play.cards.join(" ") : "过牌",
            style: play.cards.length
              ? id === state.landlord
                ? "主动抢先手"
                : "跟牌压制"
              : "等待牌权",
            risk: p.hand.length < 5 ? "低风险" : "中风险",
            confidence: p.hand.length < 5 ? "88%" : "65%",
          }
        : {
            action: "等待出牌",
            play: top ? `${cardRank(top)} · 单张` : "—",
            style: "观察牌权",
            risk: "中风险",
            confidence: "—",
          };
    });
  }
  return out;
}
function normalize(result) {
  const a = result.answers || {},
    out = {};
  ids.forEach((id) => {
    if (state.phase === "bid") {
      const b = a[`${id}_bid`] || {},
        choice = b.choice || "pass",
        bid =
          choice === "bid3"
            ? 3
            : choice === "bid2"
              ? 2
              : choice === "bid1"
                ? 1
                : 0;
      out[id] = {
        action: bid ? `叫 ${bid} 分` : "不叫",
        bid,
        play: bid ? `叫 ${bid} 分` : "不叫",
        style: bid === 3 ? "牌力强势" : "试探牌力",
        risk: bid === 3 ? "低风险" : "中风险",
        confidence: b.confidence
          ? `${Math.round(Number(b.confidence) * 100)}%`
          : "—",
      };
    } else {
      const p = a[`${id}_play`] || {},
        s = a[`${id}_style`] || {},
        r = a[`${id}_risk`] || {},
        playLabels = {
          single: "单张",
          pair: "对子",
          triple: "三张/三带",
          straight: "顺子/连对/飞机",
          bomb: "炸弹/王炸",
          pass: "过牌",
        },
        styleLabels = {
          attack: "主动抢先手",
          pressure: "压制对手",
          hold: "保留牌型",
        };
      out[id] = {
        action: playLabels[p.choice] || "等待出牌",
        play: playLabels[p.choice] || "—",
        style: styleLabels[s.choice] || "根据牌面调整",
        risk: r.legend?.[String(Math.round(Number(r.score) || 0))] || "中风险",
        confidence: r.confidence
          ? `${Math.round(Number(r.confidence) * 100)}%`
          : "—",
      };
    }
  });
  return out;
}
function usage(u = {}) {
  return {
    input: Number(u.input_tokens) || Number(u.prompt_tokens) || 0,
    output: Number(u.output_tokens) || Number(u.completion_tokens) || 0,
  };
}
async function loadApiStatus() {
  try {
    const statusUrl =
      location.protocol === "file:"
        ? "http://127.0.0.1:4173/api/status"
        : "/api/status";
    const response = await fetch(statusUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.apiReady = Boolean(data.live);
    if (data.model) {
      $("#modelBadge").textContent = data.model;
      $("#model").value = data.model;
    }
    $("#cost").textContent = state.apiReady ? "LIVE" : "DEMO";
    return state.apiReady;
  } catch {
    state.apiReady = false;
    $("#cost").textContent = "DEMO";
    return false;
  }
}
async function runJev() {
  if (state.apiReady === null) await loadApiStatus();
  const payload = buildPayload(),
    key = $("#key").value.trim(),
    configuredProxy = $("#proxy").value.trim(),
    proxy =
      configuredProxy === "/api/jev" && location.protocol === "file:"
        ? "http://127.0.0.1:4173/api/jev"
        : configuredProxy,
    serverLive = state.apiReady === true,
    demo = !key && !serverLive,
    started = performance.now();
  $("#status").textContent = "RUNNING";
  $("#status").className = "running";
  log(
    `<b>${state.phase === "bid" ? "叫分" : "出牌"}判断</b> · ${state.players[ids[state.current]].name}`,
    "wait",
  );
  let result, data;
  try {
    if (demo) {
      await new Promise((r) => setTimeout(r, 300));
      result = { usage: { prompt_tokens: state.phase === "bid" ? 68 : 104 } };
      data = demoJudgement();
      result.answers = Object.fromEntries(ids.map((id) => [id, data[id]]));
      log("<b>演示响应</b> · 本地模拟 Jev 选择", "ok");
    } else {
      const target = key ? proxy || $("#endpoint").value.trim() : "/api/jev";
      log(
        `<b>POST</b> · ${proxy ? "代理 → " : ""}${target.replace(/^https?:\/\//, "")}`,
        "wait",
      );
      const response = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { error: { message: text || response.statusText } };
      }
      if (!response.ok)
        throw Error(
          `HTTP ${response.status} · ${parsed?.error?.message || response.statusText}`,
        );
      result = parsed;
      data = normalize(result);
      log(
        `<b>Jev 响应</b> · ${Object.keys(result.answers || {}).length} 个答案`,
        "ok",
      );
    }
    renderRawAnswer(result, data);
    renderJevCards(data);
    renderDecisionList(data);
    log(`<b>原始 answers</b> · 已写入可展开面板`);
    const elapsed = Math.round(performance.now() - started),
      u = usage(result.usage);
    $("#latency").textContent = elapsed + " ms";
    $("#latency").title = `input ${u.input} / output ${u.output} tokens`;
    $("#cost").textContent = demo ? "DEMO" : "LIVE";
    $("#status").textContent = state.phase === "bid" ? "BID" : "LIVE";
    $("#status").className = state.phase === "bid" ? "running" : "live";
    log(`<b>完成</b> · ${elapsed} ms · input ${u.input || 0} tokens`, "ok");
    return data;
  } catch (e) {
    $("#status").textContent = "ERROR";
    $("#status").className = "done";
    log(`<b>调用失败</b> · ${esc(e.message)}`, "err");
    const data = {};
    ids.forEach(
      (id) =>
        (data[id] = {
          action: "等待重试",
          play: "—",
          style: "—",
          risk: "高风险",
          confidence: "—",
        }),
    );
    renderJevCards(data);
    renderDecisionList(data);
    return data;
  }
}
function bidDone() {
  const winner = state.highestBidder;
  if (!winner) return;
  state.landlord = winner;
  state.players[state.landlord].lastBid = state.highestBid;
  state.score.bid = state.highestBid || 1;
  state.score.multiplier = 1;
  state.score.bombs = 0;
  state.score.spring = 1;
  state.score.total = 0;
  state.score.deltas = {};
  state.score.winner = null;
  state.players[state.landlord].hand.push(...state.kitty);
  state.phase = "play";
  state.current = ids.indexOf(state.landlord);
  state.lastPlay = null;
  state.passCount = 0;
  renderCounts();
  renderFaceHands();
  renderHand();
  renderKitty();
  updatePhase();
  $("#hint").textContent =
    `地主：${state.players[state.landlord].name} · 拿到底牌`;
  $("#roundLabel").textContent = "PLAY 00";
  $("#center").innerHTML =
    `<i>♛</i><b>${esc(state.players[state.landlord].name)} 是地主</b><small>PLAY PHASE STARTS</small>`;
  log(
    `<b>叫分结束</b> · 地主：${esc(state.players[state.landlord].name)} · ${state.highestBid} 分`,
    "ok",
  );
  log(`<b>底牌翻开</b> · ${state.kitty.join("、")}`, "ok");
}
function applyBid(data) {
  const id = ids[state.current],
    d = data[id] || { bid: 0 },
    requested = Number(d.bid) || 0,
    bid =
      requested >= 1 && requested <= 3 && requested > state.highestBid
        ? requested
        : 0;
  state.players[id].lastBid = bid;
  state.bidHistory.push({ name: state.players[id].name, bid });
  state.bidTurn = (state.bidTurn || 0) + 1;
  if (bid) {
    state.highestBid = bid;
    state.highestBidder = id;
    state.bidPasses = 0;
  } else state.bidPasses = (state.bidPasses || 0) + 1;
  log(`<b>${esc(state.players[id].name)}</b> ${bid ? `叫 ${bid} 分` : "不叫"}`);
  const noBidder = !state.highestBidder && state.bidTurn >= 3,
    settled = state.highestBidder && (bid === 3 || state.bidPasses >= 2);
  if (bid === 3 || settled) {
    bidDone();
    return;
  }
  if (noBidder) {
    log("<b>无人叫地主</b> · 三家都选择不叫，重新发牌", "wait");
    deal({ preserveLog: true, startTurn: false });
    if (!state.auto) runPhaseTurn();
    return;
  }
  state.current = (state.current + 1) % 3;
  $("#roundLabel").textContent =
    `BID ${String(state.bidTurn + 1).padStart(2, "0")}`;
  $("#hint").textContent =
    `三人轮流叫地主 · 当前：${state.players[ids[state.current]].name} · 最高 ${state.highestBid} 分`;
  renderCounts();
}
const typeLabel = {
  single: "单张",
  pair: "对子",
  triple: "三张",
  tripleOne: "三带一",
  triplePair: "三带二",
  straight: "顺子",
  pairStraight: "连对",
  airplane: "飞机",
  airplaneSingle: "飞机带翅膀",
  airplanePair: "飞机带对",
  fourTwoSingle: "四带二",
  fourTwoPair: "四带两对",
  bomb: "炸弹",
  rocket: "王炸",
};
function groupRanks(cards) {
  const groups = {};
  cards.forEach((c) => {
    const r = rank(c);
    (groups[r] ||= []).push(c);
  });
  return groups;
}
function consecutive(values) {
  const s = [...values].sort((a, b) => a - b);
  return (
    s.length > 1 &&
    s.every((v, i) => i === 0 || v === s[i - 1] + 1) &&
    s[s.length - 1] <= 14
  );
}
function makePlay(cards) {
  const ordered = sorted(cards),
    n = ordered.length;
  if (!n) return { cards: [], type: "pass", value: 0, length: 0 };
  const groups = groupRanks(ordered),
    values = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b),
    counts = values.map((v) => groups[v].length);
  if (n === 2 && ordered.includes("小王") && ordered.includes("大王"))
    return { cards: ordered, type: "rocket", value: 17, length: 2 };
  if (n === 4 && counts.length === 1)
    return { cards: ordered, type: "bomb", value: values[0], length: 4 };
  if (n === 1)
    return { cards: ordered, type: "single", value: values[0], length: 1 };
  if (n === 2 && counts.length === 1)
    return { cards: ordered, type: "pair", value: values[0], length: 2 };
  if (n === 3 && counts.length === 1)
    return { cards: ordered, type: "triple", value: values[0], length: 3 };
  if (n === 4 && counts.includes(3))
    return {
      cards: ordered,
      type: "tripleOne",
      value: values[counts.indexOf(3)],
      length: 4,
    };
  if (n === 5 && counts.includes(3) && counts.includes(2))
    return {
      cards: ordered,
      type: "triplePair",
      value: values[counts.indexOf(3)],
      length: 5,
    };
  if (n >= 5 && counts.every((c) => c === 1) && consecutive(values))
    return {
      cards: ordered,
      type: "straight",
      value: values.at(-1),
      length: n,
    };
  if (
    n >= 6 &&
    n % 2 === 0 &&
    counts.every((c) => c === 2) &&
    consecutive(values)
  )
    return {
      cards: ordered,
      type: "pairStraight",
      value: values.at(-1),
      length: n,
    };
  const triples = values.filter((v) => groups[v].length === 3);
  if (triples.length >= 2 && consecutive(triples)) {
    const coreSize = triples.length * 3,
      left = n - coreSize;
    if (n === coreSize)
      return {
        cards: ordered,
        type: "airplane",
        value: triples.at(-1),
        length: n,
      };
    if (
      left === triples.length &&
      counts.filter((c) => c !== 3).every((c) => c === 1)
    )
      return {
        cards: ordered,
        type: "airplaneSingle",
        value: triples.at(-1),
        length: n,
      };
    if (
      left === triples.length * 2 &&
      counts.filter((c) => c !== 3).every((c) => c === 2)
    )
      return {
        cards: ordered,
        type: "airplanePair",
        value: triples.at(-1),
        length: n,
      };
  }
  if (
    n === 6 &&
    counts.includes(4) &&
    counts.filter((c) => c !== 4).every((c) => c === 1)
  )
    return {
      cards: ordered,
      type: "fourTwoSingle",
      value: values[counts.indexOf(4)],
      length: n,
    };
  if (
    n === 8 &&
    counts.includes(4) &&
    counts.filter((c) => c !== 4).every((c) => c === 2)
  )
    return {
      cards: ordered,
      type: "fourTwoPair",
      value: values[counts.indexOf(4)],
      length: n,
    };
  return { cards: ordered, type: "invalid", value: 0, length: n };
}
function candidateSort(a, b) {
  const weight = {
    rocket: 99,
    bomb: 90,
    airplanePair: 45,
    airplaneSingle: 44,
    airplane: 43,
    fourTwoPair: 42,
    fourTwoSingle: 41,
    straight: 30,
    pairStraight: 29,
    triplePair: 28,
    tripleOne: 27,
    triple: 26,
    pair: 20,
    single: 10,
  };
  return (
    (weight[a.type] || 0) - (weight[b.type] || 0) ||
    a.value - b.value ||
    a.length - b.length
  );
}
function addCandidate(list, cards) {
  const play = makePlay(cards);
  if (play.type !== "invalid" && play.type !== "pass") list.push(play);
}
function allCandidates(hand) {
  const groups = groupRanks(hand),
    values = Object.keys(groups)
      .map(Number)
      .sort((a, b) => a - b),
    out = [];
  values.forEach((v) => {
    addCandidate(out, [groups[v][0]]);
    if (groups[v].length >= 2) addCandidate(out, groups[v].slice(0, 2));
    if (groups[v].length >= 3) addCandidate(out, groups[v].slice(0, 3));
    if (groups[v].length === 4) addCandidate(out, groups[v].slice(0, 4));
  });
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 5; j <= values.length; j++) {
      const seq = values.slice(i, j);
      if (seq.at(-1) > 14 || !consecutive(seq)) break;
      addCandidate(
        out,
        seq.map((v) => groups[v][0]),
      );
    }
    for (let j = i + 3; j <= values.length; j++) {
      const seq = values.slice(i, j);
      if (seq.at(-1) > 14 || !consecutive(seq)) break;
      addCandidate(
        out,
        seq.flatMap((v) => groups[v].slice(0, 2)),
      );
    }
  }
  const triples = values.filter((v) => groups[v].length >= 3);
  for (let i = 0; i < triples.length; i++) {
    for (let j = i + 2; j <= triples.length; j++) {
      const seq = triples.slice(i, j);
      if (!consecutive(seq)) break;
      const core = seq.flatMap((v) => groups[v].slice(0, 3));
      addCandidate(out, core);
      const rest = hand.filter((c) => !core.includes(c));
      rest.slice(0, seq.length).forEach((_, k) => {
        if (k === seq.length - 1)
          addCandidate(out, core.concat(rest.slice(0, seq.length)));
      });
      const pairRanks = Object.keys(groupRanks(rest))
        .map(Number)
        .filter((v) => groupRanks(rest)[v].length >= 2);
      if (pairRanks.length >= seq.length)
        addCandidate(
          out,
          core.concat(
            pairRanks
              .slice(0, seq.length)
              .flatMap((v) => groupRanks(rest)[v].slice(0, 2)),
          ),
        );
    }
  }
  return out;
}
function canBeat(candidate, target) {
  if (candidate.type === "rocket") return target.type !== "rocket";
  if (target.type === "rocket") return false;
  if (candidate.type === "bomb")
    return target.type !== "bomb" || candidate.value > target.value;
  if (target.type === "bomb") return false;
  return (
    candidate.type === target.type &&
    candidate.length === target.length &&
    candidate.value > target.value
  );
}
function choosePlay(id) {
  const hand = sorted(state.players[id].hand);
  if (!hand.length) return { cards: [], type: "pass", value: 0 };
  const candidates = allCandidates(hand);
  if (!state.lastPlay || state.passCount >= 2) {
    const preferred = [
      "airplanePair",
      "airplaneSingle",
      "airplane",
      "fourTwoPair",
      "fourTwoSingle",
      "straight",
      "pairStraight",
      "triplePair",
      "tripleOne",
      "triple",
      "pair",
      "single",
    ];
    for (const type of preferred) {
      const found = candidates
        .filter((c) => c.type === type)
        .sort((a, b) => a.value - b.value || a.length - b.length)[0];
      if (found) return found;
    }
    return (
      candidates.sort(candidateSort)[0] || {
        cards: [hand[0]],
        type: "single",
        value: rank(hand[0]),
        length: 1,
      }
    );
  }
  const legal = candidates.filter((c) => canBeat(c, state.lastPlay));
  if (!legal.length) return { cards: [], type: "pass", value: 0 };
  return legal.sort((a, b) => {
    const bombA = a.type === "bomb" || a.type === "rocket",
      bombB = b.type === "bomb" || b.type === "rocket";
    return (
      Number(bombA) - Number(bombB) || a.value - b.value || a.length - b.length
    );
  })[0];
}
function registerBomb(play) {
  if (play.type !== "bomb" && play.type !== "rocket") return;
  state.score.bombs++;
  state.score.multiplier *= 2;
  log(
    `<b>${typeLabel[play.type]}</b> · 本局倍率翻倍至 ×${state.score.multiplier}`,
    "ok",
  );
  renderScore();
}
function settleScore(winnerId, spring) {
  const s = state.score;
  s.spring = spring;
  s.total = (s.base || 1) * (s.bid || 1) * (s.multiplier || 1) * spring;
  s.winner = winnerId;
  s.deltas = {};
  ids.forEach((id) => {
    s.deltas[id] =
      id === state.landlord
        ? winnerId === state.landlord
          ? s.total
          : -s.total
        : winnerId === state.landlord
          ? -s.total
          : s.total;
    state.scoreTotals[id] = (state.scoreTotals[id] || 0) + s.deltas[id];
  });
  renderCounts();
  renderScore();
  log(
    `<b>积分结算</b> · ${s.total} 分 · 底分 ${s.base} × 叫分 ${s.bid} × 倍率 ${s.multiplier} × 春天 ${spring}`,
    "ok",
  );
}
function applyPlay() {
  const id = ids[state.current],
    p = state.players[id],
    play = choosePlay(id);
  if (play.cards.length) {
    play.cards.forEach((card) => {
      const i = p.hand.indexOf(card);
      if (i > -1) p.hand.splice(i, 1);
    });
    state.playedBy[id]++;
    state.lastPlay = {
      cards: play.cards,
      type: play.type,
      value: play.value,
      length: play.length,
      player: id,
    };
    state.passCount = 0;
    renderPlayed(play, id);
    log(
      `<b>${esc(p.name)}</b> 出牌 · ${typeLabel[play.type] || play.type} · ${play.cards.join("、")}`,
    );
    registerBomb(play);
  } else {
    state.passCount++;
    renderPlayed(state.lastPlay, state.lastPlay?.player || id);
    log(`<b>${esc(p.name)}</b> 过牌`);
    if (state.passCount >= 2) {
      state.lastPlay = null;
      state.passCount = 0;
      log("<b>牌权重置</b> · 连续两家过牌，下一位重新出牌", "wait");
    }
  }
  state.turn++;
  state.current = (state.current + 1) % 3;
  renderCounts();
  renderFaceHands();
  renderHand();
  if (!p.hand.length) {
    state.phase = "done";
    state.playing = false;
    state.auto = false;
    clearTimeout(state.timer);
    $("#auto").hidden = false;
    $("#pause").hidden = true;
    updatePhase();
    $("#hint").textContent = `${p.name} 获胜 · 牌局结束`;
    $("#center").innerHTML =
      `<i>✦</i><b>${esc(p.name)} 获胜</b><small>REPLAY FINISHED</small>`;
    const farmerPlayed = ids
      .filter((x) => x !== state.landlord)
      .some((x) => state.playedBy[x] > 0);
    let spring = 1;
    if (id === state.landlord && !farmerPlayed) {
      spring = 2;
      log("<b>春天</b> · 地主在农民出牌前完成牌局", "ok");
    } else if (id !== state.landlord && state.playedBy[state.landlord] <= 1) {
      spring = 2;
      log("<b>反春</b> · 农民在地主仅出一手牌后获胜", "ok");
    }
    settleScore(id, spring);
    log(`<b>牌局结束</b> · ${esc(p.name)} 先出完手牌`, "ok");
  } else {
    $("#roundLabel").textContent =
      `PLAY ${String(state.turn).padStart(2, "0")}`;
    $("#hint").textContent =
      `${state.players[ids[state.current]].name} 的回合 · 等待 Jev`;
  }
}
async function runPhaseTurn() {
  if (!state.playing) return;
  if (state.phase === "bid") {
    const data = await runJev();
    applyBid(data);
  } else if (state.phase === "play") {
    const data = await runJev();
    applyPlay();
  }
  if (state.auto && state.playing) state.timer = setTimeout(runPhaseTurn, 950);
}
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
  const b = $("#config"),
    t = $("#configToggle"),
    open = t.getAttribute("aria-expanded") === "true";
  t.setAttribute("aria-expanded", String(!open));
  b.hidden = open;
  t.querySelector("b").textContent = open ? "+" : "−";
});
$("#session").textContent =
  "LOCAL-" + Math.random().toString(36).slice(2, 6).toUpperCase();
["northName", "westName", "eastName"].forEach((id) =>
  $("#" + id).addEventListener("input", syncNames),
);
$("#baseScore")?.addEventListener("input", () => {
  if (state.phase === "ready") resetScore();
});
syncNames();
resetView();
loadApiStatus();
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    if (!state.playing) deal();
    else runPhaseTurn();
  }
});
