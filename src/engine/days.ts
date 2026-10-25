const MS_PER_DAY = 86_400_000;

export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The calendar day `delta` days after (or before, if negative) a valid YYYY-MM-DD day. */
export function shiftDay(day: string, delta: number): string {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + delta * MS_PER_DAY));
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_PER_DAY);
}
