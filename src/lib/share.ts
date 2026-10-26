import { daysBetween } from "../engine/days";
import type { DailyResult } from "./progress";

export const DAILY_EPOCH = "2026-10-25";

export const dayNumber = (day: string) => daysBetween(DAILY_EPOCH, day) + 1;

const SQUARE = { right: "🟩", wrong: "🟥", timeout: "⬛" } as const;

export function buildShareText(day: string, result: DailyResult, url: string): string {
  return [
    `🧠 Stack Quiz #${dayNumber(day)}`,
    `${result.correct}/${result.total} · ${result.points} pts`,
    result.marks.map((m) => SQUARE[m]).join(""),
    url,
  ].join("\n");
}
