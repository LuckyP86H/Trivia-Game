import { z } from "zod";
import { shiftDay } from "../engine/days";
import { type Deck, review } from "../engine/leitner";
import type { Answer, Summary } from "../engine/quiz";

const resultSchema = z.object({
  points: z.number().int().min(0),
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  /** One entry per question: right, wrong or unanswered, for the share grid. */
  marks: z.array(z.enum(["right", "wrong", "timeout"])).max(20),
});

export type DailyResult = z.infer<typeof resultSchema>;

const progressSchema = z.object({
  version: z.literal(1),
  deck: z.record(
    z.string(),
    z.object({ box: z.number().int().min(1).max(5), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ),
  nickname: z.string().max(24),
  played: z.number().int().min(0),
  streak: z.number().int().min(0),
  bestStreak: z.number().int().min(0),
  lastDailyDay: z.string().nullable(),
  /** Finished Daily games by day. */
  daily: z.record(z.string(), resultSchema),
});

export type Progress = z.infer<typeof progressSchema>;

export const EMPTY_PROGRESS: Progress = {
  version: 1,
  deck: {},
  nickname: "",
  played: 0,
  streak: 0,
  bestStreak: 0,
  lastDailyDay: null,
  daily: {},
};

/** Anything unreadable (old format, hand-edited, corrupt) falls back to a fresh start. */
export function parseProgress(raw: unknown): Progress {
  const parsed = progressSchema.safeParse(raw);
  return parsed.success ? parsed.data : EMPTY_PROGRESS;
}

export type Mode = "daily" | "practice" | "review";

export function marksOf(answers: readonly Answer[]): DailyResult["marks"] {
  return answers.map((a) => (a.choice === null ? "timeout" : a.correct ? "right" : "wrong"));
}

/** Folds a finished game into the saved progress. */
export function recordGame(
  progress: Progress,
  mode: Mode,
  day: string,
  answers: readonly Answer[],
  summary: Summary,
): Progress {
  const deck: Deck = answers.reduce(
    (d, a) => review(d, a.questionId, a.correct, day),
    progress.deck,
  );
  const base = { ...progress, deck, played: progress.played + 1 };
  if (mode !== "daily" || progress.daily[day]) return base;

  const streak = progress.lastDailyDay === shiftDay(day, -1) ? progress.streak + 1 : 1;
  return {
    ...base,
    streak,
    bestStreak: Math.max(progress.bestStreak, streak),
    lastDailyDay: day,
    daily: {
      ...progress.daily,
      [day]: {
        points: summary.points,
        correct: summary.correct,
        total: summary.total,
        marks: marksOf(answers),
      },
    },
  };
}

/** The streak as it stands today: a streak that missed yesterday is already over. */
export function liveStreak(progress: Progress, today: string): number {
  const last = progress.lastDailyDay;
  return last === today || last === shiftDay(today, -1) ? progress.streak : 0;
}
