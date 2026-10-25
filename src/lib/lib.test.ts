import { describe, expect, it } from "vitest";
import type { Answer } from "../engine/quiz";
import { summarise } from "../engine/quiz";
import {
  createLeaderboard,
  type FetchLike,
  makeApiLeaderboard,
  makeLeaderboard,
  type SupabaseLike,
} from "./leaderboard";
import { EMPTY_PROGRESS, liveStreak, marksOf, parseProgress, recordGame } from "./progress";
import { buildShareText, dayNumber } from "./share";
import { type KeyValueStore, loadPlayerId, loadProgress, saveProgress } from "./storage";

const answer = (id: string, choice: number | null, correct: boolean, points = 0): Answer => ({
  questionId: id,
  choice,
  correct,
  points,
  elapsedMs: 1000,
});
const play = (answers: Answer[]) => {
  const quiz = {
    rounds: answers.map(() => ({}) as never),
    index: answers.length,
    phase: "done",
    remainingMs: 0,
    answers,
    streak: 0,
  };
  return summarise(quiz as never);
};

describe("recordGame", () => {
  const answers = [
    answer("a-1", 0, true, 150),
    answer("b-1", 2, false),
    answer("c-1", null, false),
  ];

  it("updates the review deck from every answer", () => {
    const p = recordGame(EMPTY_PROGRESS, "practice", "2026-10-25", answers, play(answers));
    expect(p.deck["a-1"]).toEqual({ box: 1, due: "2026-10-26" });
    expect(p.deck["b-1"]).toEqual({ box: 1, due: "2026-10-25" });
    expect(p.deck["c-1"]?.due).toBe("2026-10-25");
    expect(p.played).toBe(1);
    expect(p.daily).toEqual({});
  });

  it("records a daily result once and builds a streak across days", () => {
    const one = recordGame(EMPTY_PROGRESS, "daily", "2026-10-25", answers, play(answers));
    expect(one.daily["2026-10-25"]).toMatchObject({
      points: 150,
      correct: 1,
      total: 3,
      marks: ["right", "wrong", "timeout"],
    });
    expect(one.streak).toBe(1);
    const again = recordGame(one, "daily", "2026-10-25", answers, play(answers));
    expect(again.streak).toBe(1);
    expect(again.daily["2026-10-25"]?.points).toBe(150);
    const two = recordGame(one, "daily", "2026-10-26", answers, play(answers));
    expect(two).toMatchObject({ streak: 2, bestStreak: 2 });
    const gap = recordGame(two, "daily", "2026-10-30", answers, play(answers));
    expect(gap).toMatchObject({ streak: 1, bestStreak: 2 });
  });

  it("treats a streak that missed yesterday as over", () => {
    const p = recordGame(EMPTY_PROGRESS, "daily", "2026-10-25", answers, play(answers));
    expect(liveStreak(p, "2026-10-25")).toBe(1);
    expect(liveStreak(p, "2026-10-26")).toBe(1);
    expect(liveStreak(p, "2026-10-27")).toBe(0);
  });

  it("labels marks", () => {
    expect(marksOf(answers)).toEqual(["right", "wrong", "timeout"]);
  });
});

describe("saved progress", () => {
  it.each([
    null,
    "x",
    7,
    {},
    { version: 2 },
    { ...EMPTY_PROGRESS, deck: { q: { box: 9, due: "x" } } },
  ])("falls back to a fresh start for %j", (raw) => {
    expect(parseProgress(raw)).toEqual(EMPTY_PROGRESS);
  });

  it("round-trips through storage and survives corrupt or blocked storage", () => {
    const data = new Map<string, string>();
    const store: KeyValueStore = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
    };
    const p = recordGame(
      EMPTY_PROGRESS,
      "daily",
      "2026-10-25",
      [answer("a-1", 0, true, 100)],
      play([answer("a-1", 0, true, 100)]),
    );
    saveProgress(p, store);
    expect(loadProgress(store)).toEqual(p);
    data.set("stack-quiz:v1:progress", "{oops");
    expect(loadProgress(store)).toEqual(EMPTY_PROGRESS);
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error("no");
      },
      setItem: () => {
        throw new Error("no");
      },
    };
    expect(loadProgress(blocked)).toEqual(EMPTY_PROGRESS);
    expect(() => saveProgress(p, blocked)).not.toThrow();
    expect(loadProgress(null)).toEqual(EMPTY_PROGRESS);
  });
});

describe("share text", () => {
  it("numbers the puzzle and draws the result", () => {
    expect(dayNumber("2026-10-25")).toBe(1);
    expect(dayNumber("2026-11-01")).toBe(8);
    const text = buildShareText(
      "2026-10-26",
      { points: 640, correct: 3, total: 5, marks: ["right", "right", "wrong", "timeout", "right"] },
      "https://x.test/",
    );
    expect(text).toBe("🧠 Stack Quiz #2\n3/5 · 640 pts\n🟩🟩🟥⬛🟩\nhttps://x.test/");
  });
});

describe("leaderboard client", () => {
  function fake(
    opts: { session?: boolean; insertError?: { code?: string } | null; signInError?: unknown } = {},
  ) {
    const calls: string[] = [];
    const client: SupabaseLike = {
      auth: {
        getSession: async () => ({ data: { session: opts.session ? {} : null } }),
        signInAnonymously: async () => {
          calls.push("signIn");
          return { error: opts.signInError ?? null };
        },
      },
      schema: (name) => ({
        from: (table) => ({
          insert: async (row) => {
            calls.push(`${name}.${table}.insert:${JSON.stringify(row)}`);
            return { error: opts.insertError ?? null };
          },
          select: () => ({
            eq: (c, v) => ({
              order: () => ({
                limit: async (n) => {
                  calls.push(`${table}.${c}=${v}.limit${n}`);
                  return {
                    data: [{ nickname: "ada", points: 500, correct: 4, total: 5 }],
                    error: null,
                  };
                },
              }),
            }),
          }),
        }),
      }),
    };
    return { client, calls };
  }
  const score = { nickname: "  ada ", day: "2026-10-25", points: 500, correct: 4, total: 5 };

  it("signs in anonymously once, then saves the trimmed score", async () => {
    const { client, calls } = fake();
    expect(await makeLeaderboard(client).submitDaily(score)).toBe("saved");
    expect(calls[0]).toBe("signIn");
    expect(calls[1]).toContain('trivia.scores.insert:{"nickname":"ada"');
    expect(calls[1]).toContain('"mode":"daily"');
  });

  it("reuses an existing session", async () => {
    const { client, calls } = fake({ session: true });
    await makeLeaderboard(client).submitDaily(score);
    expect(calls.some((c) => c === "signIn")).toBe(false);
  });

  it("distinguishes a repeat submission from a failure", async () => {
    expect(
      await makeLeaderboard(fake({ insertError: { code: "23505" } }).client).submitDaily(score),
    ).toBe("already-submitted");
    expect(
      await makeLeaderboard(fake({ insertError: { code: "42501" } }).client).submitDaily(score),
    ).toBe("failed");
    expect(
      await makeLeaderboard(fake({ signInError: new Error("x") }).client).submitDaily(score),
    ).toBe("failed");
  });

  it("reads the public daily view and swallows network errors", async () => {
    const { client, calls } = fake();
    expect(await makeLeaderboard(client).topDaily("2026-10-25", 3)).toHaveLength(1);
    expect(calls).toContain("daily_top.day=2026-10-25.limit3");
    const broken = {
      ...client,
      schema: () => {
        throw new Error("offline");
      },
    } as unknown as SupabaseLike;
    expect(await makeLeaderboard(broken).topDaily("2026-10-25")).toBeNull();
    expect(await makeLeaderboard(broken).submitDaily(score)).toBe("failed");
  });
});

describe("Worker leaderboard", () => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const entry = { nickname: "Ada", day: "2026-10-25", points: 340, correct: 3, total: 5 };

  it("posts the score with the player id and a trimmed nickname", async () => {
    let seen: { path: string; body: unknown } | undefined;
    const fetchApi: FetchLike = async (path, init) => {
      seen = { path, body: JSON.parse(String(init?.body)) };
      return json({ saved: true }, 201);
    };
    const result = await makeApiLeaderboard(fetchApi, "player-1").submitDaily({
      ...entry,
      nickname: "  Ada ",
    });
    expect(result).toBe("saved");
    expect(seen?.path).toBe("/api/daily/2026-10-25/scores");
    expect(seen?.body).toEqual({
      nickname: "Ada",
      points: 340,
      correct: 3,
      total: 5,
      playerId: "player-1",
    });
  });

  it("maps 200 to already-submitted and any other status or a network error to failed", async () => {
    const reply =
      (status: number): FetchLike =>
      async () =>
        json({}, status);
    const lb = (f: FetchLike) => makeApiLeaderboard(f, "p");
    expect(await lb(reply(200)).submitDaily(entry)).toBe("already-submitted");
    expect(await lb(reply(400)).submitDaily(entry)).toBe("failed");
    expect(await lb(reply(500)).submitDaily(entry)).toBe("failed");
    const offline: FetchLike = async () => {
      throw new TypeError("network");
    };
    expect(await lb(offline).submitDaily(entry)).toBe("failed");
  });

  it("reads the top list, capped at the limit, and returns null when it can't", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      nickname: `P${i}`,
      points: 1,
      correct: 1,
      total: 5,
    }));
    let cache: RequestCache | undefined;
    const ok: FetchLike = async (_path, init) => {
      cache = init?.cache;
      return json({ top: rows });
    };
    expect(await makeApiLeaderboard(ok, "p").topDaily("2026-10-25", 3)).toHaveLength(3);
    expect(cache, "must revalidate so a just-posted score shows up").toBe("no-cache");
    expect(
      await makeApiLeaderboard(async () => json({}, 500), "p").topDaily("2026-10-25"),
    ).toBeNull();
    expect(
      await makeApiLeaderboard(async () => json({ nope: 1 }), "p").topDaily("2026-10-25"),
    ).toBeNull();
  });

  it("only goes online when the Worker answers its health check", async () => {
    const healthy: FetchLike = async () => json({ ok: true });
    expect(await createLeaderboard({ playerId: "p", fetchApi: healthy })).not.toBeNull();

    // A static host answers every path with the HTML page, which is not JSON.
    const spa: FetchLike = async () => new Response("<!doctype html>", { status: 200 });
    expect(await createLeaderboard({ playerId: "p", fetchApi: spa })).toBeNull();
    expect(
      await createLeaderboard({ playerId: "p", fetchApi: async () => json({ ok: false }) }),
    ).toBeNull();
    expect(await createLeaderboard({ fetchApi: healthy })).toBeNull();
  });
});

describe("loadPlayerId", () => {
  const memory = (): KeyValueStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it("creates an id once and then reuses it", () => {
    const store = memory();
    const first = loadPlayerId(store);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(loadPlayerId(store)).toBe(first);
  });

  it("still returns an id when storage is blocked", () => {
    const blocked: KeyValueStore = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadPlayerId(blocked)).toHaveLength(36);
    expect(loadPlayerId(null)).toHaveLength(36);
  });
});
