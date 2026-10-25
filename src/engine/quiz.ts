import type { Deck } from "./leitner";
import { isDue } from "./leitner";
import type { Question, Topic } from "./question";
import { createRng, hashSeed, type Rng, shuffle } from "./random";

export const SECONDS_PER_QUESTION = 20;
export const TIME_LIMIT_MS = SECONDS_PER_QUESTION * 1000;
export const BASE_POINTS = 100;
export const MAX_SPEED_BONUS = 50;
export const MAX_STREAK_BONUS = 50;
export const STREAK_STEP = 10;
/** The most one question can ever be worth; the leaderboard rejects anything above it. */
export const MAX_POINTS_PER_QUESTION = BASE_POINTS + MAX_SPEED_BONUS + MAX_STREAK_BONUS;

export interface Round {
  readonly question: Question;
  /** The four answers in the order shown. */
  readonly choices: readonly string[];
}

export interface Answer {
  readonly questionId: string;
  /** Index into the round's choices, or null when time ran out. */
  readonly choice: number | null;
  readonly correct: boolean;
  readonly points: number;
  readonly elapsedMs: number;
}

export type Phase = "answering" | "feedback" | "done";

export interface Quiz {
  readonly rounds: readonly Round[];
  readonly index: number;
  readonly phase: Phase;
  readonly remainingMs: number;
  readonly answers: readonly Answer[];
  readonly streak: number;
}

export function startQuiz(questions: readonly Question[], rng: Rng): Quiz {
  const rounds = questions.map((question) => ({
    question,
    choices: shuffle([question.correct, ...question.wrong], rng),
  }));
  return {
    rounds,
    index: 0,
    phase: rounds.length === 0 ? "done" : "answering",
    remainingMs: TIME_LIMIT_MS,
    answers: [],
    streak: 0,
  };
}

export function currentRound(quiz: Quiz): Round | undefined {
  return quiz.rounds[quiz.index];
}

export function pointsFor(remainingMs: number, streakBefore: number): number {
  const speed = Math.floor((MAX_SPEED_BONUS * Math.max(0, remainingMs)) / TIME_LIMIT_MS);
  const streak = Math.min(streakBefore * STREAK_STEP, MAX_STREAK_BONUS);
  return BASE_POINTS + speed + streak;
}

function record(quiz: Quiz, choice: number | null): Quiz {
  const round = currentRound(quiz);
  if (!round) return quiz;
  const correct = choice !== null && round.choices[choice] === round.question.correct;
  const answer: Answer = {
    questionId: round.question.id,
    choice,
    correct,
    points: correct ? pointsFor(quiz.remainingMs, quiz.streak) : 0,
    elapsedMs: TIME_LIMIT_MS - quiz.remainingMs,
  };
  return {
    ...quiz,
    phase: "feedback",
    answers: [...quiz.answers, answer],
    streak: correct ? quiz.streak + 1 : 0,
  };
}

/** The player picked an answer. Ignored unless a question is open. */
export function answer(quiz: Quiz, choice: number): Quiz {
  if (quiz.phase !== "answering") return quiz;
  const round = currentRound(quiz);
  if (!round || !Number.isInteger(choice) || choice < 0 || choice >= round.choices.length)
    return quiz;
  return record(quiz, choice);
}

/**
 * Time passed. When the clock reaches zero the question counts as unanswered and moves to
 * feedback. (The 2019 version never advanced at this point, so the game froze.)
 */
export function tick(quiz: Quiz, elapsedMs: number): Quiz {
  if (quiz.phase !== "answering" || elapsedMs <= 0) return quiz;
  const remainingMs = Math.max(0, quiz.remainingMs - elapsedMs);
  const next = { ...quiz, remainingMs };
  return remainingMs === 0 ? record(next, null) : next;
}

/** Leave the feedback screen: show the next question, or finish. */
export function next(quiz: Quiz): Quiz {
  if (quiz.phase !== "feedback") return quiz;
  const index = quiz.index + 1;
  return index >= quiz.rounds.length
    ? { ...quiz, index, phase: "done" }
    : { ...quiz, index, phase: "answering", remainingMs: TIME_LIMIT_MS };
}

export interface Summary {
  readonly total: number;
  readonly correct: number;
  readonly wrong: number;
  readonly unanswered: number;
  readonly points: number;
  readonly bestStreak: number;
}

export function summarise(quiz: Quiz): Summary {
  let streak = 0;
  let bestStreak = 0;
  for (const a of quiz.answers) {
    streak = a.correct ? streak + 1 : 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return {
    total: quiz.rounds.length,
    correct: quiz.answers.filter((a) => a.correct).length,
    wrong: quiz.answers.filter((a) => !a.correct && a.choice !== null).length,
    unanswered: quiz.answers.filter((a) => a.choice === null).length,
    points: quiz.answers.reduce((sum, a) => sum + a.points, 0),
    bestStreak,
  };
}

export interface Selection {
  readonly count: number;
  readonly topics?: readonly Topic[];
}

/**
 * Picks questions for a game: cards that are due for review come first, then questions never
 * seen, then the rest. The chosen set is shuffled so the order carries no hint.
 */
export function pickQuestions(
  bank: readonly Question[],
  deck: Deck,
  today: string,
  rng: Rng,
  { count, topics }: Selection,
): Question[] {
  const pool = bank.filter((q) => !topics || topics.length === 0 || topics.includes(q.topic));
  const due = shuffle(
    pool.filter((q) => isDue(deck, q.id, today)),
    rng,
  );
  const unseen = shuffle(
    pool.filter((q) => deck[q.id] === undefined),
    rng,
  );
  const rest = shuffle(
    pool.filter((q) => deck[q.id] !== undefined && !isDue(deck, q.id, today)),
    rng,
  );
  return shuffle([...due, ...unseen, ...rest].slice(0, count), rng);
}

/** Only the questions that are due, for the Review mode. */
export function dueQuestions(
  bank: readonly Question[],
  deck: Deck,
  today: string,
  rng: Rng,
  count: number,
) {
  return shuffle(
    bank.filter((q) => isDue(deck, q.id, today)),
    rng,
  ).slice(0, count);
}

export const DAILY_COUNT = 5;

/** The same five questions for everyone on a given UTC day. */
export function dailySet(
  bank: readonly Question[],
  day: string,
): { questions: Question[]; rng: Rng } {
  const rng = createRng(hashSeed(`stack-quiz/daily/${day}`));
  return { questions: shuffle(bank, rng).slice(0, DAILY_COUNT), rng };
}
