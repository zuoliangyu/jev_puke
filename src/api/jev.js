import { ids, typeLabel } from "../core/constants.js";
import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { cardRank, groupRanks, rank, sorted } from "../game/cards.js";
import { choosePlay } from "../game/rules.js";

export function buildPayload(id = ids[state.current]) {
  if (!ids.includes(id)) throw new Error(`未知玩家：${id}`);
  const players = state.players;
  const player = players[id];
  const currentId = ids[state.current];
  const last = state.lastPlay
    ? `${players[state.lastPlay.player]?.name || "玩家"} ${state.lastPlay.type} ${state.lastPlay.cards.join("")}`
    : "无";
  const visiblePlayers = ids
    .map((otherId) => {
      const other = players[otherId];
      if (otherId === id) {
        return `${other.name}（你，${other.hand.length}张）：${sorted(other.hand).join("、")}`;
      }
      return `${other.name}（${otherId === state.landlord ? "地主" : "对手"}，仅知手牌数量 ${other.hand.length}张）`;
    })
    .join("；");
  const stateText = `你是${player.name}（玩家 ${id}）。阶段：${state.phase === "bid" ? "叫地主" : "出牌"}。回合：${state.turn}。当前玩家：${players[currentId].name}。玩家信息：${visiblePlayers}。最近公开动作：${last}。叫分记录：${state.bidHistory.map((item) => item.name + " " + item.bid).join("、") || "无"}。当前最高叫分：${state.highestBid || 0} 分。${state.phase === "bid" ? "叫地主只能选择高于当前最高分的 1-3 分，或选择不叫。" : `地主是${state.landlord ? players[state.landlord].name : "尚未产生"}，当前牌权公开信息如上。`} 你只能根据自己的完整手牌和公开信息作答，绝对不要假设或输出其他玩家的具体牌面。遵循斗地主牌型规则：单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二、炸弹、王炸。`;
  const questions = {};

  if (state.phase === "bid") {
    questions[`${id}_bid`] = {
      type: "choice",
      instructions: `根据你自己的完整手牌判断这轮是否应该叫地主及叫几分。当前最高叫分为 ${state.highestBid || 0} 分，只能叫更高分；综合大小王、2、对子、三张和顺子潜力评估牌力。只有牌力明显不足时才选择不叫，不要因为看不到对手牌面而默认 pass。`,
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
      instructions: "判断你当前应该打什么牌型。",
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
      instructions: "判断你当前的进攻方式。",
      criteria: {
        attack: "主动抢先手。",
        pressure: "压制对手出牌。",
        hold: "保留关键牌型。",
      },
    };
    questions[`${id}_risk`] = {
      type: "score",
      instructions: "评估你接下来两轮结束牌局的风险。",
      criteria: ["低风险", "中风险", "高风险"],
    };
  }

  return {
    model: $("#model").value.trim() || "jev-1.13",
    state: stateText,
    questions,
  };
}

function demoBidPlan() {
  const strength = (id) => {
    const hand = state.players[id].hand;
    const groups = groupRanks(hand);
    const counts = Object.values(groups);
    return (
      hand.reduce((sum, card) => sum + rank(card), 0) +
      counts.filter((count) => count >= 2).length * 4 +
      counts.filter((count) => count >= 3).length * 7 +
      counts.filter((count) => count === 4).length * 14 +
      (hand.includes("小王") && hand.includes("大王") ? 28 : 0)
    );
  };

  const ranked = ids
    .map((id) => ({ id, score: strength(id) }))
    .sort((a, b) => b.score - a.score || ids.indexOf(a.id) - ids.indexOf(b.id));
  const plan = {};
  ranked.forEach((item, index) => {
    plan[item.id] = index === 0 ? 3 : index === 1 ? 2 : 1;
  });
  return plan;
}

export function demoJudgement() {
  const output = {};
  if (state.phase === "bid") {
    const plan = demoBidPlan();
    const currentId = ids[state.current];
    const target = plan[currentId] || 0;
    const bid = target > state.highestBid ? target : 0;
    ids.forEach((id) => {
      const current = id === currentId;
      output[id] = current
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
      const player = state.players[id];
      const top = sorted(player.hand)[0];
      const current = ids[state.current] === id;
      const play = current ? choosePlay(id) : null;
      output[id] = current
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
            risk: player.hand.length < 5 ? "低风险" : "中风险",
            confidence: player.hand.length < 5 ? "88%" : "65%",
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
  return output;
}

export function normalize(result, id = ids[state.current]) {
  const answers = result.answers || {};
  if (state.phase === "bid") {
    const answer = answers[`${id}_bid`] || answers.bid || {};
    const choice = answer.choice || "pass";
    const bid =
      choice === "bid3" ? 3 : choice === "bid2" ? 2 : choice === "bid1" ? 1 : 0;
    return {
      action: bid ? `叫 ${bid} 分` : "不叫",
      bid,
      play: bid ? `叫 ${bid} 分` : "不叫",
      style: bid === 3 ? "牌力强势" : "试探牌力",
      risk: bid === 3 ? "低风险" : "中风险",
      confidence: answer.confidence
        ? `${Math.round(Number(answer.confidence) * 100)}%`
        : "—",
    };
  }

  const play = answers[`${id}_play`] || {};
  const style = answers[`${id}_style`] || {};
  const risk = answers[`${id}_risk`] || {};
  const playLabels = {
    single: "单张",
    pair: "对子",
    triple: "三张/三带",
    straight: "顺子/连对/飞机",
    bomb: "炸弹/王炸",
    pass: "过牌",
  };
  const styleLabels = {
    attack: "主动抢先手",
    pressure: "压制对手",
    hold: "保留牌型",
  };
  return {
    action: playLabels[play.choice] || "等待出牌",
    play: playLabels[play.choice] || "—",
    style: styleLabels[style.choice] || "根据牌面调整",
    risk:
      risk.legend?.[String(Math.round(Number(risk.score) || 0))] || "中风险",
    confidence: risk.confidence
      ? `${Math.round(Number(risk.confidence) * 100)}%`
      : "—",
  };
}

export function usage(value = {}) {
  return {
    input: Number(value.input_tokens) || Number(value.prompt_tokens) || 0,
    output: Number(value.output_tokens) || Number(value.completion_tokens) || 0,
  };
}

export async function loadApiStatus() {
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
    updateApiMode();
    return state.apiReady;
  } catch {
    state.apiReady = false;
    updateApiMode();
    return false;
  }
}

export function updateApiMode() {
  const hasPageKey = Boolean($("#key")?.value.trim());
  $("#cost").textContent = hasPageKey
    ? "PAGE"
    : state.apiReady
      ? "LIVE"
      : "DEMO";
}

function resolveProxy() {
  const configuredProxy = $("#proxy").value.trim();
  return configuredProxy === "/api/jev" && location.protocol === "file:"
    ? "http://127.0.0.1:4173/api/jev"
    : configuredProxy;
}

export function getRequestInfo() {
  const key = $("#key").value.trim();
  const proxy = resolveProxy();
  const serverLive = state.apiReady === true;
  const demo = !key && !serverLive;
  return {
    demo,
    target: demo ? "" : key ? proxy || $("#endpoint").value.trim() : "/api/jev",
  };
}

async function requestOne(id, target, key) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  let response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(buildPayload(id)),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw Error(`${id} Jev 请求超时（25 秒）`);
    throw Error(`${id} Jev 请求失败：${error.message}`);
  } finally {
    window.clearTimeout(timeout);
  }

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: { message: text || response.statusText } };
  }
  if (!response.ok) {
    throw Error(
      `${id} HTTP ${response.status} · ${parsed?.error?.message || response.statusText}`,
    );
  }
  return parsed;
}

function fallbackDecision(id) {
  return state.phase === "bid"
    ? {
        action: "不叫",
        bid: 0,
        play: "不叫",
        style: "等待重试",
        risk: "高风险",
        confidence: "—",
      }
    : {
        action: "等待重试",
        play: "—",
        style: "—",
        risk: "高风险",
        confidence: "—",
      };
}

export async function requestJev() {
  if (state.apiReady === null) await loadApiStatus();

  const key = $("#key").value.trim();
  const { demo, target } = getRequestInfo();
  updateApiMode();

  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = {
      usage: { prompt_tokens: state.phase === "bid" ? 68 : 104 },
    };
    const data = demoJudgement();
    result.answers = Object.fromEntries(ids.map((id) => [id, data[id]]));
    return { result, data, demo, target: "", requests: 0 };
  }

  const settled = await Promise.allSettled(
    ids.map(async (id) => ({ id, result: await requestOne(id, target, key) })),
  );
  const answers = {};
  const players = {};
  const data = {};
  const errors = {};
  let input = 0;
  let output = 0;

  settled.forEach((item, index) => {
    const id = ids[index];
    if (item.status === "fulfilled") {
      const result = item.value.result;
      players[id] = result;
      Object.assign(answers, result.answers || {});
      data[id] = normalize(result, id);
      const tokenUsage = usage(result.usage);
      input += tokenUsage.input;
      output += tokenUsage.output;
    } else {
      errors[id] = item.reason?.message || "未知错误";
      data[id] = fallbackDecision(id);
    }
  });

  if (!Object.keys(players).length) {
    throw Error(`3 个独立 Jev 请求均失败：${Object.values(errors).join("；")}`);
  }

  const result = {
    answers,
    usage: { input_tokens: input, output_tokens: output },
    players,
    ...(Object.keys(errors).length ? { errors } : {}),
  };
  return {
    result,
    data,
    demo,
    target,
    requests: ids.length,
    errors,
  };
}
