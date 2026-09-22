import { state } from "../core/state.js";
import { typeLabel } from "../core/constants.js";
import { cardRank, consecutive, groupRanks, rank, sorted } from "./cards.js";

export function makePlay(cards) {
  const ordered = sorted(cards);
  const length = ordered.length;
  if (!length) return { cards: [], type: "pass", value: 0, length: 0 };

  const groups = groupRanks(ordered);
  const values = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);
  const counts = values.map((value) => groups[value].length);

  if (length === 2 && ordered.includes("小王") && ordered.includes("大王"))
    return { cards: ordered, type: "rocket", value: 17, length: 2 };
  if (length === 4 && counts.length === 1)
    return { cards: ordered, type: "bomb", value: values[0], length: 4 };
  if (length === 1)
    return { cards: ordered, type: "single", value: values[0], length: 1 };
  if (length === 2 && counts.length === 1)
    return { cards: ordered, type: "pair", value: values[0], length: 2 };
  if (length === 3 && counts.length === 1)
    return { cards: ordered, type: "triple", value: values[0], length: 3 };
  if (length === 4 && counts.includes(3))
    return {
      cards: ordered,
      type: "tripleOne",
      value: values[counts.indexOf(3)],
      length: 4,
    };
  if (length === 5 && counts.includes(3) && counts.includes(2))
    return {
      cards: ordered,
      type: "triplePair",
      value: values[counts.indexOf(3)],
      length: 5,
    };
  if (
    length >= 5 &&
    counts.every((count) => count === 1) &&
    consecutive(values)
  )
    return {
      cards: ordered,
      type: "straight",
      value: values.at(-1),
      length,
    };
  if (
    length >= 6 &&
    length % 2 === 0 &&
    counts.every((count) => count === 2) &&
    consecutive(values)
  )
    return {
      cards: ordered,
      type: "pairStraight",
      value: values.at(-1),
      length,
    };

  const triples = values.filter((value) => groups[value].length === 3);
  if (triples.length >= 2 && consecutive(triples)) {
    const coreSize = triples.length * 3;
    const attachments = length - coreSize;
    if (length === coreSize)
      return {
        cards: ordered,
        type: "airplane",
        value: triples.at(-1),
        length,
      };
    if (
      attachments === triples.length &&
      counts.filter((count) => count !== 3).every((count) => count === 1)
    )
      return {
        cards: ordered,
        type: "airplaneSingle",
        value: triples.at(-1),
        length,
      };
    if (
      attachments === triples.length * 2 &&
      counts.filter((count) => count !== 3).every((count) => count === 2)
    )
      return {
        cards: ordered,
        type: "airplanePair",
        value: triples.at(-1),
        length,
      };
  }
  if (
    length === 6 &&
    counts.includes(4) &&
    counts.filter((count) => count !== 4).every((count) => count === 1)
  )
    return {
      cards: ordered,
      type: "fourTwoSingle",
      value: values[counts.indexOf(4)],
      length,
    };
  if (
    length === 8 &&
    counts.includes(4) &&
    counts.filter((count) => count !== 4).every((count) => count === 2)
  )
    return {
      cards: ordered,
      type: "fourTwoPair",
      value: values[counts.indexOf(4)],
      length,
    };
  return { cards: ordered, type: "invalid", value: 0, length };
}

export function candidateSort(a, b) {
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

export function allCandidates(hand) {
  const groups = groupRanks(hand);
  const values = Object.keys(groups)
    .map(Number)
    .sort((a, b) => a - b);
  const candidates = [];

  values.forEach((value) => {
    addCandidate(candidates, [groups[value][0]]);
    if (groups[value].length >= 2)
      addCandidate(candidates, groups[value].slice(0, 2));
    if (groups[value].length >= 3)
      addCandidate(candidates, groups[value].slice(0, 3));
    if (groups[value].length === 4)
      addCandidate(candidates, groups[value].slice(0, 4));
  });

  for (let start = 0; start < values.length; start++) {
    for (let end = start + 5; end <= values.length; end++) {
      const sequence = values.slice(start, end);
      if (sequence.at(-1) > 14 || !consecutive(sequence)) break;
      addCandidate(
        candidates,
        sequence.map((value) => groups[value][0]),
      );
    }
    for (let end = start + 3; end <= values.length; end++) {
      const sequence = values.slice(start, end);
      if (sequence.at(-1) > 14 || !consecutive(sequence)) break;
      addCandidate(
        candidates,
        sequence.flatMap((value) => groups[value].slice(0, 2)),
      );
    }
  }

  const triples = values.filter((value) => groups[value].length >= 3);
  for (let start = 0; start < triples.length; start++) {
    for (let end = start + 2; end <= triples.length; end++) {
      const sequence = triples.slice(start, end);
      if (!consecutive(sequence)) break;
      const core = sequence.flatMap((value) => groups[value].slice(0, 3));
      addCandidate(candidates, core);

      const rest = hand.filter((card) => !core.includes(card));
      rest.slice(0, sequence.length).forEach((_, index) => {
        if (index === sequence.length - 1)
          addCandidate(candidates, core.concat(rest.slice(0, sequence.length)));
      });

      const restGroups = groupRanks(rest);
      const pairRanks = Object.keys(restGroups)
        .map(Number)
        .filter((value) => restGroups[value].length >= 2);
      if (pairRanks.length >= sequence.length)
        addCandidate(
          candidates,
          core.concat(
            pairRanks
              .slice(0, sequence.length)
              .flatMap((value) => restGroups[value].slice(0, 2)),
          ),
        );
    }
  }
  return candidates;
}

export function canBeat(candidate, target) {
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

export function choosePlay(id) {
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
        .filter((candidate) => candidate.type === type)
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

  const legal = candidates.filter((candidate) =>
    canBeat(candidate, state.lastPlay),
  );
  if (!legal.length) return { cards: [], type: "pass", value: 0 };
  return legal.sort((a, b) => {
    const bombA = a.type === "bomb" || a.type === "rocket";
    const bombB = b.type === "bomb" || b.type === "rocket";
    return (
      Number(bombA) - Number(bombB) || a.value - b.value || a.length - b.length
    );
  })[0];
}

export { cardRank, typeLabel };
