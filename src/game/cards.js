import { rankValue, ranks, suits } from "../core/constants.js";

export function shuffle(cards) {
  for (let index = cards.length - 1; index; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [cards[index], cards[randomIndex]] = [cards[randomIndex], cards[index]];
  }
  return cards;
}

export function makeDeck() {
  return shuffle([
    ...suits.flatMap((suit) => ranks.map((rank) => suit + rank)),
    "小王",
    "大王",
  ]);
}

export function cardRank(card) {
  return card === "小王" || card === "大王" ? card : card.slice(1);
}

export function rank(card) {
  return rankValue[cardRank(card)] || 0;
}

export function sorted(hand) {
  return [...hand].sort((a, b) => rank(a) - rank(b));
}

export function groupRanks(cards) {
  const groups = {};
  cards.forEach((card) => {
    const value = rank(card);
    (groups[value] ||= []).push(card);
  });
  return groups;
}

export function consecutive(values) {
  const sortedValues = [...values].sort((a, b) => a - b);
  return (
    sortedValues.length > 1 &&
    sortedValues.every(
      (value, index) => index === 0 || value === sortedValues[index - 1] + 1,
    ) &&
    sortedValues.at(-1) <= 14
  );
}
