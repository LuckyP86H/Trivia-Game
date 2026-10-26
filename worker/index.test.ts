import { env, exports } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { shiftDay, utcDay } from "../src/engine/days";
import { BASE_POINTS, DAILY_COUNT, MAX_POINTS_PER_QUESTION } from "../src/engine/quiz";

const ORIGIN = "https://quiz.test";
const today = utcDay(new Date());
const PLAYER = "6f1c4a9e-2f64-4f27-9b51-0f0f6a1b8c01";

// Storage is isolated per test file, not per test, so start every test from an empty table.
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM daily_scores").run();
});

const score = (overrides: Record<string, unknown> = {}) => ({
  playerId: PLAYER,
  nickname: "Ada",
  points: 3 * BASE_POINTS + 40,
  correct: 3,
  total: DAILY_COUNT,
  ...overrides,
});

function post(day: string, body: unknown, init: RequestInit = {}) {
  return exports.default.fetch(`${ORIGIN}/api/daily/${day}/scores`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...init,
  });
}

const top = (day: string) => exports.default.fetch(`${ORIGIN}/api/daily/${day}/top`);

describe("GET /api/health", () => {
  it("reports ok and sets security headers", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("POST /api/daily/:day/scores", () => {
  it("saves a first score and lists it", async () => {
    const response = await post(today, score());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ saved: true });

    const body = (await (await top(today)).json()) as { top: unknown[] };
    expect(body.top).toEqual([{ nickname: "Ada", points: 340, correct: 3, total: DAILY_COUNT }]);
  });

  it("keeps the first score when the same player posts again", async () => {
    await post(today, score());
    const second = await post(today, score({ points: 5 * MAX_POINTS_PER_QUESTION, correct: 5 }));
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ saved: false });

    const body = (await (await top(today)).json()) as { top: { points: number }[] };
    expect(body.top).toHaveLength(1);
    expect(body.top[0]?.points).toBe(340);
  });

  it("trims the nickname", async () => {
    await post(today, score({ nickname: "  Grace  " }));
    const body = (await (await top(today)).json()) as { top: { nickname: string }[] };
    expect(body.top[0]?.nickname).toBe("Grace");
  });

  it("accepts yesterday and tomorrow but not further away", async () => {
    expect((await post(shiftDay(today, -1), score())).status).toBe(201);
    expect((await post(shiftDay(today, 1), score())).status).toBe(201);
    const far = await post(shiftDay(today, -2), score());
    expect(far.status).toBe(422);
    expect(await far.json()).toEqual({ error: "day_out_of_range" });
  });

  it.each([
    ["more correct than questions", { correct: 6, points: 600 }],
    ["wrong number of questions", { total: 7 }],
    ["points above what the correct answers can earn", { points: 3 * MAX_POINTS_PER_QUESTION + 1 }],
    ["points below the base for the correct answers", { points: 3 * BASE_POINTS - 1 }],
    ["points with no correct answers", { correct: 0, points: 10 }],
    ["fractional points", { points: 340.5 }],
    ["negative points", { points: -1 }],
    ["an empty nickname", { nickname: "   " }],
    ["a nickname over 24 characters", { nickname: "x".repeat(25) }],
    ["a nickname with a control character", { nickname: "Ada\nLovelace" }],
    ["a player id that is not a UUID", { playerId: "player-1" }],
    ["an unexpected field", { admin: true }],
  ])("rejects %s", async (_label, overrides) => {
    const response = await post(today, score(overrides));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_body" });
    expect(((await (await top(today)).json()) as { top: unknown[] }).top).toEqual([]);
  });

  it("accepts a score of zero when nothing was answered correctly", async () => {
    expect((await post(today, score({ correct: 0, points: 0 }))).status).toBe(201);
  });

  it("rejects a malformed day", async () => {
    const response = await post("2026-13-45", score());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_day" });
  });

  it("rejects non-JSON bodies and content types", async () => {
    expect((await post(today, score(), { body: "not json" })).status).toBe(400);
    const plain = await post(today, score(), { headers: { "content-type": "text/plain" } });
    expect(plain.status).toBe(415);
  });

  it("rejects an oversized body", async () => {
    const response = await post(today, score({ nickname: "a".repeat(5000) }));
    expect(response.status).toBe(413);
  });

  it("answers other methods with 405", async () => {
    const response = await exports.default.fetch(`${ORIGIN}/api/daily/${today}/scores`);
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});

describe("GET /api/daily/:day/top", () => {
  it("ranks by points, earliest first on ties, and returns at most ten", async () => {
    for (let i = 0; i < 12; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      const correct = 1 + (i % 5);
      await post(today, score({ playerId: id, nickname: `P${i}`, correct, points: correct * 120 }));
    }
    const body = (await (await top(today)).json()) as { top: { points: number }[] };
    expect(body.top).toHaveLength(10);
    const points = body.top.map((row) => row.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
  });

  it("only shows the requested day and never exposes player ids", async () => {
    await post(today, score());
    await post(shiftDay(today, -1), score({ nickname: "Old" }));
    const text = await (await top(today)).text();
    expect(text).toContain("Ada");
    expect(text).not.toContain("Old");
    expect(text).not.toContain(PLAYER);
  });

  it("rejects a malformed day and unknown routes", async () => {
    expect((await top("yesterday")).status).toBe(400);
    expect((await exports.default.fetch(`${ORIGIN}/api/nope`)).status).toBe(404);
  });
});

describe("day validation", () => {
  it.each(["2026-13-45", "2026-02-31", "2026-1-5", "abcd-ef-gh"])("rejects %s", async (day) => {
    expect((await top(day)).status).toBe(400);
    expect((await post(day, score())).status).toBe(400);
  });
});
