import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Supabase provides auth.users, auth.uid() and the anon/authenticated roles. This stub
// reproduces just those pieces so the real migration can run on a real Postgres engine.
const SUPABASE_STUB = `
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create role anon nologin;
  create role authenticated nologin;
  grant usage on schema auth to anon, authenticated;
`;
const MIGRATION = readFileSync(
  new URL("./migrations/20261025000000_scores.sql", import.meta.url),
  "utf8",
);

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

/** Runs SQL the way PostgREST would for a given player (or an anonymous visitor). */
async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`set role ${user ? "authenticated" : "anon"}`);
  await db.exec(`select set_config('request.jwt.claim.sub', '${user ?? ""}', false)`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const insert = (user: string | null, over: Record<string, unknown> = {}) => {
  const v = {
    nickname: "ada",
    mode: "daily",
    day: "2026-10-25",
    points: 600,
    correct: 4,
    total: 5,
    ...over,
  };
  return as(
    user,
    `insert into trivia.scores (nickname, mode, day, points, correct, total) values ($1,$2,$3,$4,$5,$6)`,
    [v.nickname, v.mode, v.day, v.points, v.correct, v.total],
  );
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
});

afterAll(async () => {
  await db.close();
});

// One Postgres for the whole file; each test starts from a freshly applied migration.
beforeEach(async () => {
  await db.exec("drop schema if exists trivia cascade; truncate auth.users cascade");
  await db.exec(MIGRATION);
  await db.exec(`insert into auth.users values ('${ALICE}'), ('${BOB}')`);
});

describe("trivia.scores", () => {
  it("lets a signed-in player post a score as themselves", async () => {
    await insert(ALICE);
    const rows = await as(null, "select nickname, points from trivia.scores");
    expect(rows.rows).toEqual([{ nickname: "ada", points: 600 }]);
  });

  it("refuses anonymous visitors (no session) and rejects posting as someone else", async () => {
    await expect(insert(null)).rejects.toThrow(/permission denied/);
    await db.exec("set role authenticated");
    await db.exec(`select set_config('request.jwt.claim.sub', '${ALICE}', false)`);
    await expect(
      db.query(
        `insert into trivia.scores (user_id, nickname, mode, points, correct, total) values ($1,'x','daily',1,1,1)`,
        [BOB],
      ),
    ).rejects.toThrow(/row-level security/);
    await db.exec("reset role");
  });

  it("allows one daily score per player per day, but many practice scores", async () => {
    await insert(ALICE);
    await expect(insert(ALICE)).rejects.toThrow(/duplicate key/);
    await insert(ALICE, { day: "2026-10-26" });
    await insert(ALICE, { mode: "practice" });
    await insert(ALICE, { mode: "practice" });
    await insert(BOB);
  });

  it.each([
    ["an impossible total", { points: 2000, correct: 5, total: 5 }],
    ["more correct than asked", { correct: 6, total: 5 }],
    ["negative points", { points: -1 }],
    ["a blank nickname", { nickname: "   " }],
    ["a very long nickname", { nickname: "x".repeat(25) }],
    ["an unknown mode", { mode: "cheat" }],
    ["too many questions", { total: 21, correct: 1 }],
  ])("rejects %s", async (_name, over) => {
    await expect(insert(ALICE, over)).rejects.toThrow(/violates check constraint/);
  });

  it("accepts the best possible score and rejects one point more", async () => {
    await insert(ALICE, { points: 1000, correct: 5, total: 5 });
    await expect(insert(BOB, { points: 1001, correct: 5, total: 5 })).rejects.toThrow(
      /check constraint/,
    );
  });

  it("makes the leaderboard public without exposing user ids", async () => {
    await insert(ALICE, { nickname: "ada", points: 700 });
    await insert(BOB, { nickname: "bob", points: 900 });
    const top = await as(null, "select nickname, points from trivia.daily_top");
    expect(top.rows).toEqual([
      { nickname: "bob", points: 900 },
      { nickname: "ada", points: 700 },
    ]);
    await expect(as(null, "select user_id from trivia.daily_top")).rejects.toThrow(
      /does not exist/,
    );
  });

  it("never lets anyone edit scores, and only owners delete their own", async () => {
    await insert(ALICE);
    await expect(as(ALICE, "update trivia.scores set points = 1000")).rejects.toThrow(
      /permission denied/,
    );
    const bobDelete = await as(BOB, "delete from trivia.scores returning id");
    expect(bobDelete.rows).toHaveLength(0);
    const aliceDelete = await as(ALICE, "delete from trivia.scores returning id");
    expect(aliceDelete.rows).toHaveLength(1);
  });

  it("removes a player's scores when their account is deleted", async () => {
    await insert(ALICE);
    await db.exec(`delete from auth.users where id = '${ALICE}'`);
    expect((await db.query("select count(*)::int as n from trivia.scores")).rows).toEqual([
      { n: 0 },
    ]);
  });
});
