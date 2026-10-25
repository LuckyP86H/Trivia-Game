import { describe, expect, it } from "vitest";
import { QUESTION_BANK } from "../data/bank";
import { review } from "./leitner";
import { validateBank } from "./question";
import {
  answer,
  currentRound,
  DAILY_COUNT,
  dailySet,
  MAX_POINTS_PER_QUESTION,
  next,
  pickQuestions,
  pointsFor,
  startQuiz,
  summarise,
  TIME_LIMIT_MS,
  tick,
} from "./quiz";
import { createRng, hashSeed, shuffle } from "./random";

const bank = QUESTION_BANK;
const three = bank.slice(0, 3);
const begin = (questions = three) => startQuiz(questions, createRng(1));
const correctIndex = (quiz: ReturnType<typeof begin>) => {
  const round = currentRound(quiz);
  return round ? round.choices.indexOf(round.question.correct) : -1;
};

describe("question bank", () => {
  it("passes every structural check", () => {
    expect(validateBank(bank)).toEqual([]);
  });
  it("is big enough for varied games", () => {
    expect(bank.length).toBeGreaterThanOrEqual(40);
  });
  it("spreads difficulty and topics", () => {
    expect(new Set(bank.map((q) => q.difficulty)).size).toBe(3);
    expect(new Set(bank.map((q) => q.topic)).size).toBe(9);
  });
  it("catches duplicates and clashing answers", () => {
    const [a] = bank;
    if (!a) throw new Error("empty bank");
    const clash = {
      ...a,
      id: "python-99",
      wrong: [a.correct, "x", "y"] as [string, string, string],
    };
    expect(validateBank([a, a])).toContain(`${a.id}: duplicate id`);
    expect(validateBank([clash]).join()).toContain("the four answers must differ");
  });
});

describe("shuffle and seeds", () => {
  it("keeps every item and never touches the input", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, createRng(3));
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("is repeatable per seed", () => {
    expect(shuffle([1, 2, 3, 4, 5], createRng(9))).toEqual(shuffle([1, 2, 3, 4, 5], createRng(9)));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
  });
});

describe("a quiz", () => {
  it("shows four answers per question including exactly the right one", () => {
    const quiz = begin();
    for (const round of quiz.rounds) {
      expect(round.choices).toHaveLength(4);
      expect(round.choices.filter((c) => c === round.question.correct)).toHaveLength(1);
    }
  });

  it("scores a correct answer with a speed bonus and a growing streak", () => {
    let quiz = begin();
    quiz = tick(quiz, 0);
    quiz = answer(quiz, correctIndex(quiz));
    expect(quiz.answers[0]).toMatchObject({ correct: true, points: pointsFor(TIME_LIMIT_MS, 0) });
    quiz = next(quiz);
    quiz = answer(quiz, correctIndex(quiz));
    expect(quiz.answers[1]?.points).toBe(pointsFor(TIME_LIMIT_MS, 1));
    expect(quiz.streak).toBe(2);
  });

  it("gives nothing for a wrong answer and resets the streak", () => {
    let quiz = begin();
    quiz = answer(quiz, correctIndex(quiz));
    quiz = next(quiz);
    quiz = answer(quiz, (correctIndex(quiz) + 1) % 4);
    expect(quiz.answers[1]).toMatchObject({ correct: false, points: 0 });
    expect(quiz.streak).toBe(0);
  });

  it("moves on when the timer reaches zero (the 2019 game froze here)", () => {
    let quiz = begin();
    quiz = tick(quiz, TIME_LIMIT_MS - 1);
    expect(quiz.phase).toBe("answering");
    quiz = tick(quiz, 1);
    expect(quiz.phase).toBe("feedback");
    expect(quiz.answers[0]).toMatchObject({ choice: null, correct: false, points: 0 });
    quiz = next(quiz);
    expect(quiz).toMatchObject({ phase: "answering", index: 1, remainingMs: TIME_LIMIT_MS });
  });

  it("ignores late input: no double answers, no answers during feedback, no bad indexes", () => {
    let quiz = begin();
    const first = answer(quiz, 0);
    expect(answer(first, 1)).toBe(first);
    expect(tick(first, 5000)).toBe(first);
    expect(answer(quiz, 4)).toBe(quiz);
    expect(answer(quiz, -1)).toBe(quiz);
    expect(answer(quiz, 1.5)).toBe(quiz);
    quiz = next(quiz);
    expect(quiz).toBe(quiz);
  });

  it("finishes after the last question and summarises", () => {
    let quiz = begin();
    quiz = answer(quiz, correctIndex(quiz));
    quiz = next(quiz);
    quiz = answer(quiz, (correctIndex(quiz) + 1) % 4);
    quiz = next(quiz);
    quiz = tick(quiz, TIME_LIMIT_MS);
    quiz = next(quiz);
    expect(quiz.phase).toBe("done");
    expect(summarise(quiz)).toMatchObject({
      total: 3,
      correct: 1,
      wrong: 1,
      unanswered: 1,
      bestStreak: 1,
    });
    expect(next(quiz)).toBe(quiz);
  });

  it("never exceeds the per-question point cap", () => {
    expect(pointsFor(TIME_LIMIT_MS, 99)).toBe(MAX_POINTS_PER_QUESTION);
    expect(pointsFor(0, 0)).toBe(100);
  });

  it("handles an empty game", () => {
    expect(begin([]).phase).toBe("done");
  });
});

describe("choosing questions", () => {
  const today = "2026-10-25";
  const rng = () => createRng(5);

  it("filters by topic and respects the count", () => {
    const picked = pickQuestions(bank, {}, today, rng(), { count: 4, topics: ["sql"] });
    expect(picked).toHaveLength(4);
    expect(picked.every((q) => q.topic === "sql")).toBe(true);
  });

  it("puts due reviews first, then unseen questions", () => {
    const [a, b] = bank;
    if (!a || !b) throw new Error("bank too small");
    let deck = review({}, a.id, false, "2026-10-20");
    deck = review(deck, b.id, true, today);
    const picked = pickQuestions(bank, deck, today, rng(), { count: 3 });
    expect(picked.map((q) => q.id)).toContain(a.id);
    expect(picked.map((q) => q.id)).not.toContain(b.id);
  });

  it("deals the same daily five to everyone, and different days differ", () => {
    const one = dailySet(bank, "2026-10-25").questions.map((q) => q.id);
    expect(one).toHaveLength(DAILY_COUNT);
    expect(dailySet(bank, "2026-10-25").questions.map((q) => q.id)).toEqual(one);
    expect(dailySet(bank, "2026-10-26").questions.map((q) => q.id)).not.toEqual(one);
  });
});
