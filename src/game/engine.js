import { ids } from "../core/constants.js";
import { $, esc } from "../core/dom.js";
import { state } from "../core/state.js";
import { makeDeck } from "./cards.js";
import { choosePlay } from "./rules.js";
import {
  renderCounts,
  renderDecisionList,
  renderFaceHands,
  renderHand,
  renderJevCards,
  renderKitty,
  renderPlayed,
  renderRawAnswer,
  renderScore,
  resetScore,
  syncNames,
  updatePhase,
} from "../ui/render.js";
import { loadApiStatus, requestJev, usage } from "../api/jev.js";
import { typeLabel } from "../core/constants.js";

export function resetView() {
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
  Object.values(state.players).forEach((player) => (player.hand = []));
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

export function deal({ preserveLog = false, startTurn = true } = {}) {
  syncNames();
  const deck = makeDeck();
  ids.forEach((id, index) => {
    state.players[id].hand = deck.slice(index * 17, index * 17 + 17);
    state.playedBy[id] = 0;
  });
  state.kitty = deck.slice(51);
  Object.values(state.players).forEach((player) => (player.lastBid = 0));
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

export function bidDone() {
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

export function applyBid(data) {
  const id = ids[state.current];
  const decision = data[id] || { bid: 0 };
  const requested = Number(decision.bid) || 0;
  const bid =
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
  } else {
    state.bidPasses = (state.bidPasses || 0) + 1;
  }
  log(`<b>${esc(state.players[id].name)}</b> ${bid ? `叫 ${bid} 分` : "不叫"}`);

  const noBidder = !state.highestBidder && state.bidTurn >= 3;
  const settled = state.highestBidder && (bid === 3 || state.bidPasses >= 2);
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
  const score = state.score;
  score.spring = spring;
  score.total =
    (score.base || 1) * (score.bid || 1) * (score.multiplier || 1) * spring;
  score.winner = winnerId;
  score.deltas = {};
  ids.forEach((id) => {
    score.deltas[id] =
      id === state.landlord
        ? winnerId === state.landlord
          ? score.total
          : -score.total
        : winnerId === state.landlord
          ? -score.total
          : score.total;
    state.scoreTotals[id] = (state.scoreTotals[id] || 0) + score.deltas[id];
  });
  renderCounts();
  renderScore();
  log(
    `<b>积分结算</b> · ${score.total} 分 · 底分 ${score.base} × 叫分 ${score.bid} × 倍率 ${score.multiplier} × 春天 ${spring}`,
    "ok",
  );
}

export function applyPlay() {
  const id = ids[state.current];
  const player = state.players[id];
  const play = choosePlay(id);
  if (play.cards.length) {
    play.cards.forEach((card) => {
      const index = player.hand.indexOf(card);
      if (index > -1) player.hand.splice(index, 1);
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
      `<b>${esc(player.name)}</b> 出牌 · ${typeLabel[play.type] || play.type} · ${play.cards.join("、")}`,
    );
    registerBomb(play);
  } else {
    state.passCount++;
    renderPlayed(state.lastPlay, state.lastPlay?.player || id);
    log(`<b>${esc(player.name)}</b> 过牌`);
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
  if (!player.hand.length) {
    state.phase = "done";
    state.playing = false;
    state.auto = false;
    clearTimeout(state.timer);
    $("#auto").hidden = false;
    $("#pause").hidden = true;
    updatePhase();
    $("#hint").textContent = `${player.name} 获胜 · 牌局结束`;
    $("#center").innerHTML =
      `<i>✦</i><b>${esc(player.name)} 获胜</b><small>REPLAY FINISHED</small>`;

    const farmerPlayed = ids
      .filter((other) => other !== state.landlord)
      .some((other) => state.playedBy[other] > 0);
    let spring = 1;
    if (id === state.landlord && !farmerPlayed) {
      spring = 2;
      log("<b>春天</b> · 地主在农民出牌前完成牌局", "ok");
    } else if (id !== state.landlord && state.playedBy[state.landlord] <= 1) {
      spring = 2;
      log("<b>反春</b> · 农民在地主仅出一手牌后获胜", "ok");
    }
    settleScore(id, spring);
    log(`<b>牌局结束</b> · ${esc(player.name)} 先出完手牌`, "ok");
  } else {
    $("#roundLabel").textContent =
      `PLAY ${String(state.turn).padStart(2, "0")}`;
    $("#hint").textContent =
      `${state.players[ids[state.current]].name} 的回合 · 等待 Jev`;
  }
}

async function runJev() {
  if (state.apiReady === null) await loadApiStatus();
  const started = performance.now();
  $("#status").textContent = "RUNNING";
  $("#status").className = "running";
  log(
    `<b>${state.phase === "bid" ? "叫分" : "出牌"}判断</b> · ${state.players[ids[state.current]].name}`,
    "wait",
  );

  try {
    const response = await requestJev();
    if (response.demo) {
      log("<b>演示响应</b> · 本地模拟 Jev 选择", "ok");
    } else {
      log(
        `<b>POST</b> · 代理 → ${response.target.replace(/^https?:\/\//, "")}`,
        "wait",
      );
      log(
        `<b>Jev 响应</b> · ${Object.keys(response.result.answers || {}).length} 个答案`,
        "ok",
      );
    }
    renderRawAnswer(response.result, response.data);
    renderJevCards(response.data);
    renderDecisionList(response.data);
    log("<b>原始 answers</b> · 已写入可展开面板");
    const elapsed = Math.round(performance.now() - started);
    const tokenUsage = usage(response.result.usage);
    $("#latency").textContent = elapsed + " ms";
    $("#latency").title =
      `input ${tokenUsage.input} / output ${tokenUsage.output} tokens`;
    $("#cost").textContent = response.demo ? "DEMO" : "LIVE";
    $("#status").textContent = state.phase === "bid" ? "BID" : "LIVE";
    $("#status").className = state.phase === "bid" ? "running" : "live";
    log(
      `<b>完成</b> · ${elapsed} ms · input ${tokenUsage.input || 0} tokens`,
      "ok",
    );
    return response.data;
  } catch (error) {
    $("#status").textContent = "ERROR";
    $("#status").className = "done";
    log(`<b>调用失败</b> · ${esc(error.message)}`, "err");
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

export async function runPhaseTurn() {
  if (!state.playing) return;
  if (state.phase === "bid") {
    const data = await runJev();
    applyBid(data);
  } else if (state.phase === "play") {
    await runJev();
    applyPlay();
  }
  if (state.auto && state.playing) state.timer = setTimeout(runPhaseTurn, 950);
}
