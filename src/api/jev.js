import { ids, typeLabel } from "../core/constants.js";
import { $, esc } from "../core/dom.js";
import { state } from "../core/state.js";
import { cardRank, groupRanks, rank, sorted } from "../game/cards.js";
import { choosePlay, isTeammate } from "../game/rules.js";

export function buildPayload(id = ids[state.current]) {
  if (!ids.includes(id)) throw new Error(`未知玩家：${id}`);
  const players = state.players;
  const player = players[id];
  const currentId = ids[state.current];
  const landlord = state.landlord;
  const relation = (otherId) =>
    otherId === id
      ? "你"
      : !landlord
        ? "对手"
        : isTeammate(id, otherId)
          ? "农民·你的队友"
          : otherId === landlord
            ? "地主·你的对手"
            : "农民·你的对手";
  const visiblePlayers = ids
    .map((otherId) => {
      const other = players[otherId];
      if (otherId === id) {
        return `${other.name}（你${landlord ? (id === landlord ? "·地主" : "·农民") : ""}，${other.hand.length}张）：${sorted(other.hand).join("、")}`;
      }
      return `${other.name}（${relation(otherId)}，仅知手牌数量 ${other.hand.length}张）`;
    })
    .join("；");

  const free = !state.lastPlay || state.passCount >= 2;
  const lastBy = state.lastPlay?.player;
  const last = state.lastPlay
    ? `${players[lastBy]?.name || "玩家"}（${relation(lastBy)}）打出 ${typeLabel[state.lastPlay.type] || state.lastPlay.type} ${state.lastPlay.cards.join("")}${state.passCount ? `，之后 ${state.passCount} 家过牌` : ""}`
    : "无";
  const teammates = landlord
    ? ids.filter((otherId) => isTeammate(id, otherId))
    : [];
  const farmers = ids.filter((otherId) => otherId !== landlord);

  // 阵营与配合原则：农民之间是队友，决定了该不该压上一手
  const teamText = !landlord
    ? "阵营规则：叫到地主的人拿走底牌，一人对抗另外两家；另外两家是农民，互为队友，任意一名农民先出完则两名农民都获胜。"
    : id === landlord
      ? `阵营规则：你是地主，一人对抗 ${farmers.map((otherId) => players[otherId].name).join("、")} 两名农民；他们互为队友，会配合压你。你先出完才获胜，任意一名农民先出完你就输。`
      : `阵营规则：你是农民，${teammates.map((otherId) => players[otherId].name).join("、")} 是你的队友，${players[landlord].name} 是地主、你们共同的对手。你或队友任意一人先出完，你们都获胜。配合原则：队友打出的牌如果已经够大，一般选择过牌让队友继续走，不要去压队友；地主的牌要尽量压住，地主手牌很少时更要顶住，必要时用炸弹。`;
  const turnText =
    state.phase !== "play"
      ? ""
      : free
        ? "现在牌权在你，必须主动出牌，不能过牌。"
        : `现在需要跟牌：只能用同牌型更大的牌或炸弹压过「${last}」，也可以过牌。${lastBy && isTeammate(id, lastBy) ? "这手牌是你的队友打的。" : ""}`;

  const stateText = `你是${player.name}（玩家 ${id}）。阶段：${state.phase === "bid" ? "叫地主" : "出牌"}。回合：${state.turn}。当前玩家：${players[currentId].name}。玩家信息：${visiblePlayers}。${teamText}最近公开动作：${last}。${turnText}叫分记录：${state.bidHistory.map((item) => item.name + " " + item.bid).join("、") || "无"}。当前最高叫分：${state.highestBid || 0} 分。${state.phase === "bid" ? "叫地主只能选择高于当前最高分的 1-3 分，或选择不叫。" : ""} 你只能根据自己的完整手牌和公开信息作答，绝对不要假设或输出其他玩家的具体牌面。遵循斗地主牌型规则：单张、对子、三张、三带一、三带二、顺子、连对、飞机、四带二、炸弹、王炸。`;
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
      instructions: free
        ? "牌权在你，判断你应该主动打出什么牌型，不能选择 pass。"
        : lastBy && isTeammate(id, lastBy)
          ? "上一手是你的队友打的。判断你是否要压：通常应选择 pass 让队友继续走牌，只有你能借此一口气出完或明显更有利时才出牌。"
          : "判断你应该用什么牌型压过上一手，压不过或不值得压时选择 pass。",
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
      instructions: "结合你和队友的局面，判断你当前的进攻方式。",
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
              : play.source === "teammate"
                ? "让队友走牌"
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
    hint: { choice: play.choice, style: style.choice },
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
    // 服务端模型只对应 JEV_TARGET（默认 E-FlowCode），别覆盖官方 / 自定义的模型名
    if (data.model && $("#provider").value === "eflow") {
      $("#model").value = data.model;
    }
    $("#modelBadge").textContent = $("#model").value.trim() || "—";
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

// 两家服务的 Key 与模型名互不通用：官方用 jev-latest，E-FlowCode 用 jev-1.13。
export const providers = {
  eflow: {
    endpoint: "https://www.e-flowcode.cc/v1/systemone",
    model: "jev-1.13",
  },
  typesafe: {
    endpoint: "https://api.typesafe.ai/v1/systemone",
    model: "jev-latest",
  },
};

export function applyProvider(id) {
  const preset = providers[id];
  if (!preset) return;
  $("#endpoint").value = preset.endpoint;
  $("#model").value = preset.model;
  $("#modelBadge").textContent = preset.model;
  $("#modelOptions").innerHTML = "";
  setModelsStatus("");
}

export function syncProviderFromEndpoint() {
  const endpoint = $("#endpoint").value.trim();
  const match = Object.entries(providers).find(
    ([, preset]) => preset.endpoint === endpoint,
  );
  $("#provider").value = match ? match[0] : "custom";
}

function setModelsStatus(text, error = false) {
  const element = $("#modelsStatus");
  element.textContent = text;
  element.className = error ? "error" : "";
}

function localUrl(path) {
  return location.protocol === "file:" ? `http://127.0.0.1:4173${path}` : path;
}

export async function fetchModels() {
  const button = $("#fetchModels");
  const key = $("#key").value.trim();
  const endpoint = $("#endpoint").value.trim();
  button.disabled = true;
  setModelsStatus("获取中…");
  try {
    const response = await fetch(localUrl("/api/models"), {
      headers: {
        ...(key ? { Authorization: `Bearer ${key}`, "X-Jev-Target": endpoint } : {}),
      },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw Error(`HTTP ${response.status} · ${data?.error?.message || response.statusText}`);
    const models = data.models || [];
    if (!models.length) throw Error("接口未返回可用模型");

    $("#modelOptions").innerHTML = models
      .map(
        (item) =>
          `<option value="${esc(item.id)}">${esc(item.description || item.id)}</option>`,
      )
      .join("");
    const current = $("#model").value.trim();
    if (!models.some((item) => item.id === current)) {
      $("#model").value = models[0].id;
      $("#modelBadge").textContent = models[0].id;
    }
    setModelsStatus(`${models.length} 个可用`);
    return models;
  } catch (error) {
    setModelsStatus(error.message, true);
    throw error;
  } finally {
    button.disabled = false;
  }
}

function resolveProxy() {
  const configuredProxy = $("#proxy").value.trim();
  return configuredProxy === "/api/jev" ? localUrl("/api/jev") : configuredProxy;
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

// E-FlowCode 返回 {error:{message}}，TypeSafe 官方返回 {detail:{message}} 或 {detail:"..."}
function errorMessage(payload) {
  return (
    payload?.error?.message ||
    payload?.detail?.message ||
    (typeof payload?.detail === "string" ? payload.detail : "")
  );
}

async function requestOne(id, target, key, endpoint, payload) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 25_000);
  let response;
  try {
    response = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
        // 经本地代理时告诉它真正的上游；直连上游时不需要这个头
        ...(key && endpoint && target !== endpoint
          ? { "X-Jev-Target": endpoint }
          : {}),
      },
      body: JSON.stringify(payload),
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
      `${id} HTTP ${response.status} · ${errorMessage(parsed) || response.statusText}`,
    );
  }
  return parsed;
}

// onRequest(payload, route) 在真正发出请求前调用，用来把请求体写进日志
export async function requestJev(onRequest) {
  if (state.apiReady === null) await loadApiStatus();

  const currentId = ids[state.current];
  const key = $("#key").value.trim();
  const { demo, target } = getRequestInfo();
  updateApiMode();

  if (demo) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const result = {
      usage: { prompt_tokens: state.phase === "bid" ? 68 : 104 },
    };
    const judgement = demoJudgement()[currentId];
    result.answers = { [currentId]: judgement };
    return {
      result,
      data: { [currentId]: judgement },
      demo,
      target: "",
      requests: 0,
      player: currentId,
    };
  }

  const endpoint = $("#endpoint").value.trim();
  const payload = buildPayload(currentId);
  const forwarded = Boolean(key && endpoint && target !== endpoint);
  onRequest?.(payload, {
    target,
    upstream: forwarded ? endpoint : "",
  });
  const result = await requestOne(currentId, target, key, endpoint, payload);
  return {
    result,
    data: { [currentId]: normalize(result, currentId) },
    demo,
    target,
    requests: 1,
    player: currentId,
  };
}
