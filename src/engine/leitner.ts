import { daysBetween, shiftDay } from "./days";

/** Leitner boxes 1-5. A correct answer moves a card up; a miss sends it back to box 1. */
export const MAX_BOX = 5;

/** Days to wait before a card in each box is due again (index = box). */
const INTERVAL_DAYS = [0, 1, 2, 4, 8, 16] as const;

export interface Card {
  readonly box: number;
  /** The first day the card is due again (YYYY-MM-DD, UTC). */
  readonly due: string;
}

export type Deck = Readonly<Record<string, Card>>;

export function review(deck: Deck, questionId: string, correct: boolean, today: string): Deck {
  const box = correct ? Math.min((deck[questionId]?.box ?? 0) + 1, MAX_BOX) : 1;
  const wait = INTERVAL_DAYS[correct ? box : 0] ?? 0;
  return { ...deck, [questionId]: { box, due: shiftDay(today, wait) } };
}

export function isDue(deck: Deck, questionId: string, today: string): boolean {
  const card = deck[questionId];
  return card !== undefined && daysBetween(today, card.due) <= 0;
}

export function dueCount(deck: Deck, today: string): number {
  return Object.keys(deck).filter((id) => isDue(deck, id, today)).length;
}

/** 0-100: how far through the boxes the questions you have seen are. */
export function mastery(deck: Deck, bankSize: number): number {
  if (bankSize === 0) return 0;
  const total = Object.values(deck).reduce((sum, card) => sum + card.box, 0);
  return Math.round((100 * total) / (bankSize * MAX_BOX));
}
