import { ids, typeLabel } from "../core/constants.js";
import { $ } from "../core/dom.js";
import { state } from "../core/state.js";
import { cardRank, groupRanks, rank, sorted } from "../game/cards.js";
import { choosePlay } from "../game/rules.js";

export function buildPayload() {
  const players = state.players;
  const last = state.lastPlay
    ? `${state.lastPlay.type} ${state.lastPlay.cards.join("")}`
    : "无";
  const stateText = `阶段：${state.phase === "bid" ? "叫地主" : "出牌"}。回合：${state.turn}。当前玩家：${players[ids[state.current]].name}。${players.north.name}/${players.west.name}/${players.east.name}的手牌数量：${players.north.hand.length}/${players.west.hand.length}/${players.east.hand.length}。最近动作：${last}。叫分记录：${state.bidHistory.map((item) => item.name + " " + item.bid).join("、") || "无"}。当前最高叫分：${state.highestBid || 0} 分；叫地主只能选择高于当前最高分的 1-3 分，或选择不叫。遵循斗地主牌型规则：单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二、炸弹、王炸。`;
  const questions = {};

  ids.forEach((id) => {
    const name = players[id].name;
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
      return;
    }

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
  });

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

export function normalize(result) {
  const answers = result.answers || {};
  const output = {};
  ids.forEach((id) => {
    if (state.phase === "bid") {
      const answer = answers[`${id}_bid`] || {};
      const choice = answer.choice || "pass";
      const bid =
        choice === "bid3"
          ? 3
          : choice === "bid2"
            ? 2
            : choice === "bid1"
              ? 1
              : 0;
      output[id] = {
        action: bid ? `叫 ${bid} 分` : "不叫",
        bid,
        play: bid ? `叫 ${bid} 分` : "不叫",
        style: bid === 3 ? "牌力强势" : "试探牌力",
        risk: bid === 3 ? "低风险" : "中风险",
        confidence: answer.confidence
          ? `${Math.round(Number(answer.confidence) * 100)}%`
          : "—",
      };
      return;
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
    output[id] = {
      action: playLabels[play.choice] || "等待出牌",
      play: playLabels[play.choice] || "—",
      style: styleLabels[style.choice] || "根据牌面调整",
      risk:
        risk.legend?.[String(Math.round(Number(risk.score) || 0))] || "中风险",
      confidence: risk.confidence
        ? `${Math.round(Number(risk.confidence) * 100)}%`
        : "—",
    };
  });
  return output;
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
    $("#cost").textContent = state.apiReady ? "LIVE" : "DEMO";
    return state.apiReady;
  } catch {
    state.apiReady = false;
    $("#cost").textContent = "DEMO";
    return false;
  }
}

function resolveProxy() {
  const configuredProxy = $("#proxy").value.trim();
  return configuredProxy === "/api/jev" && location.protocol === "file:"
    ? "http://127.0.0.1:4173/api/jev"
    : configuredProxy;
}

export async function requestJev() {
  if (state.apiReady === null) await loadApiStatus();

  const payload = buildPayload();
  const key = $("#key").value.trim();
  const proxy = resolveProxy();
  const serverLive = state.apiReady === true;
  const demo = !key && !serverLive;

  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = {
      usage: { prompt_tokens: state.phase === "bid" ? 68 : 104 },
    };
    const data = demoJudgement();
    result.answers = Object.fromEntries(ids.map((id) => [id, data[id]]));
    return { result, data, demo, target: "" };
  }

  const target = key ? proxy || $("#endpoint").value.trim() : "/api/jev";
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
  return { result: parsed, data: normalize(parsed), demo, target };
}
