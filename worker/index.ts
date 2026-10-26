import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { daysBetween, utcDay } from "../src/engine/days";
import { BASE_POINTS, DAILY_COUNT, MAX_POINTS_PER_QUESTION } from "../src/engine/quiz";
import { readTop, saveScore } from "./scores";

const MAX_BODY_BYTES = 2 * 1024;
const TOP_LIMIT = 10;

/** Scores are accepted for today and one day either side, to tolerate clock and time-zone skew. */
const ACCEPTED_DAY_DRIFT = 1;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDay(day: string): boolean {
  if (!DAY_PATTERN.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  // "2026-13-45" parses to an Invalid Date; "2026-02-31" rolls over to March, so compare back.
  return !Number.isNaN(date.getTime()) && utcDay(date) === day;
}

const scoreSchema = z
  .strictObject({
    playerId: z.uuid(),
    nickname: z
      .string()
      .trim()
      .min(1)
      .max(24)
      // Printable text only: no control characters or line breaks in a public list.
      .refine((name) => !/\p{C}/u.test(name)),
    points: z.number().int().min(0),
    correct: z.number().int().min(0),
    total: z.literal(DAILY_COUNT),
  })
  .refine((score) => score.correct <= score.total)
  // Every right answer is worth between the base and the maximum; a wrong or timed-out one is worth 0.
  .refine(
    (score) =>
      score.points >= score.correct * BASE_POINTS &&
      score.points <= score.correct * MAX_POINTS_PER_QUESTION,
  );

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", secureHeaders());

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/daily/:day/top", async (c) => {
  const day = c.req.param("day");
  if (!isValidDay(day)) return c.json({ error: "invalid_day" }, 400);

  const top = await readTop(c.env.DB, day, TOP_LIMIT);
  c.header("Cache-Control", "public, max-age=15");
  return c.json({ day, top });
});

app.post(
  "/api/daily/:day/scores",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "payload_too_large" }, 413),
  }),
  async (c) => {
    const day = c.req.param("day");
    if (!isValidDay(day)) return c.json({ error: "invalid_day" }, 400);
    if (Math.abs(daysBetween(utcDay(new Date()), day)) > ACCEPTED_DAY_DRIFT) {
      return c.json({ error: "day_out_of_range" }, 422);
    }

    if (!c.req.header("content-type")?.toLowerCase().startsWith("application/json")) {
      return c.json({ error: "unsupported_media_type" }, 415);
    }
    const body: unknown = await c.req.json().catch(() => undefined);
    const score = scoreSchema.safeParse(body);
    if (!score.success) return c.json({ error: "invalid_body" }, 400);

    // One score per player per day: the first one stands.
    const saved = await saveScore(c.env.DB, day, score.data);
    c.header("Cache-Control", "no-store");
    return c.json({ saved }, saved ? 201 : 200);
  },
);

app.all("/api/daily/:day/scores", (c) => {
  c.header("Allow", "POST");
  return c.json({ error: "method_not_allowed" }, 405);
});

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((error, c) => {
  console.error("unhandled error", error);
  return c.json({ error: "internal_error" }, 500);
});

export default app;
