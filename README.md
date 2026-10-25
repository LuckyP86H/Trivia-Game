# 🧠 Stack Quiz

A timed quiz on the tools a backend and data engineer works with: Python, queues and streams (Celery, RabbitMQ, Kafka), search (Elasticsearch), AWS, Redis, Snowflake, SQL, stats and ML, and LLMs. Twenty seconds a question, a daily challenge the whole world shares, and spaced repetition that brings back what you miss.

> Originally "Trivia Game", a 2019 jQuery assignment on data science from the University of Toronto SCS Coding Boot Camp, rebuilt in 2026.
> The old version is in [`docs/legacy`](docs/legacy/trivia-2019-banner.png).

**Live demo:** not deployed yet. See [Deploy](#deploy).

## How to play

- **Daily challenge**: the same five questions for everyone each day (UTC). Share a result grid like `🟩🟩🟥🟩⬛`, build a streak.
- **Practice**: ten questions, pick topics or take a mix.
- **Review**: only the questions that are due again. A miss returns tomorrow or sooner; each correct answer pushes a question further out (1, 2, 4, 8, then 16 days).
- Keys: `1`-`4` answer, `Enter` continues.
- Scoring: 100 points, up to 50 for speed, up to 50 for a streak. If time runs out the question counts as unanswered and the game moves on.

## What changed since 2019

| | 2019 | Now |
| --- | --- | --- |
| Timer | When it hit zero the game **froze** (the timeout branch never advanced) | Timeout is a normal outcome; covered by unit and E2E tests |
| Questions | Eight, several malformed ("Infrential", answer sets that didn't fit the question) | 46 reviewed questions across nine topics, each with an explanation, validated by a schema and a test |
| Learning | None | Leitner spaced repetition and a mastery score |
| Replay value | Same questions in a random order | Daily challenge, streaks, share grid, practice by topic |
| Leaderboard | None | Optional online board on Supabase with row-level security |
| Stack | jQuery 3.2.1, `<p1>` tags, one global script | Vue 3, Pinia, TypeScript, Tailwind 4, Vite 8 |
| Accessibility | Click targets were `div`s | Real buttons, keyboard play, live announcements, WCAG 2.2 AA scans in both themes |
| Tests | None | Unit, SQL (real Postgres), end-to-end and accessibility, all in CI |

## Run it locally

Requires Node 22.12 or newer (`.nvmrc` pins 24) and pnpm 11 via Corepack.

```sh
corepack enable
pnpm install
pnpm exec playwright install chromium   # only for the E2E tests
pnpm dev                                # http://localhost:5173
```

The game is fully playable with no setup. Copy `.env.example` to `.env.local` and fill it in to turn on the online leaderboard.

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm preview` | Dev server, type-check plus production build, serve the build |
| `pnpm test` | Engine tests and the SQL tests |
| `pnpm e2e` | Playwright on desktop and phone profiles, plus axe accessibility scans |
| `pnpm lint` / `pnpm format` | Biome (Vue files are checked by `vue-tsc` instead) |
| `pnpm typecheck` | `vue-tsc` for the app, `tsc` for tooling and tests |
| `pnpm knip` | Unused files, exports and dependencies |
| `pnpm validate` | All of the above, in order |

## How it works

- [`src/engine`](src/engine): pure TypeScript with no Vue or DOM. A quiz is a small state machine (`answering`, `feedback`, `done`) driven by `answer`, `tick` and `next`. Leitner scheduling and question selection live here too, so they are tested without a browser.
- [`src/data/bank.ts`](src/data/bank.ts): the question bank. Each question has one correct answer and three distractors, shuffled per game. `validateBank` rejects duplicates and clashing answers, and the same schema is the gate for any future AI-generated questions.
- [`src/stores/game.ts`](src/stores/game.ts): one Pinia store connecting the engine to the screens and saving progress to `localStorage` (corrupt or blocked storage falls back to a fresh start).
- The daily set comes from a seeded shuffle keyed by the UTC date, so it needs no server. The timer counts in 100 ms ticks and one tick never counts for more than 250 ms, so a tab left in the background doesn't use up a player's time.

## Online leaderboard

The Daily result screen can post a score to a public board. The game is fully playable without it: if no backend answers, the form simply doesn't appear. There are two interchangeable backends behind the same `Leaderboard` interface in [`src/lib/leaderboard.ts`](src/lib/leaderboard.ts).

### Cloudflare Worker + D1 (default)

[`worker/`](worker) is a small Hono API on the same Worker that serves the site, backed by D1 ([`migrations/`](migrations)):

| Method and path | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check; the client only shows the board when this answers `{ "ok": true }` |
| `GET /api/daily/:day/top` | Top 10 for a day: nickname, points, correct, total (no player ids) |
| `POST /api/daily/:day/scores` | Body `{ playerId, nickname, points, correct, total }`. `201` new, `200` already posted |

The Worker re-checks everything it can: the day must be today +/- 1 (UTC), a nickname is 1 to 24 printable characters, a Daily has exactly five questions, and the points must be consistent with the number correct (100 to 200 per right answer, nothing for a wrong one). A player (random per-browser UUID, no accounts) keeps their first score of the day. Scores are still reported by the browser, so a determined player can post a plausible fake within those limits; fine for a practice board, and a serious one would verify answers on the server.

### Supabase (optional alternative)

If `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set at build time, the site uses Supabase instead. [`supabase/migrations`](supabase/migrations) creates a `trivia` schema (so one Supabase project can host several apps) with a `scores` table and a public `daily_top` view. Row-level security means:

- anyone can read scores, and nobody can edit them;
- a player can only insert and delete rows as themselves (anonymous sign-in counts);
- one Daily score per player per day, and scores are capped at what the game can award (200 points per question).

The SQL is tested against a real Postgres engine (PGlite) with Supabase's `auth.uid()` and roles stubbed, including the policies and constraints. It has **not** been run against a real Supabase project yet.

Setup:

1. `supabase link --project-ref <ref>` then `supabase db push` (or paste the migration into the SQL editor).
2. Dashboard → Authentication → enable **Anonymous sign-ins**.
3. Dashboard → Project Settings → API → add `trivia` to **Exposed schemas**.
4. Put `VITE_SUPABASE_URL` and the anon/publishable key in `.env.local` (and as repository **variables** for CI). Both are public by design; never use the service-role key in this app.

Free-tier note: Supabase pauses free projects after a week without activity, and a paused project makes the board unreachable (the game keeps working). The free plan also allows only two active projects, so this schema is designed to share one.

## Deploy

The app is one Cloudflare Worker: static assets for the site plus the `/api/*` leaderboard, with a D1 database, all declared in [`wrangler.jsonc`](wrangler.jsonc). The database id in that file belongs to the original deployment; a fork creates its own with `pnpm exec wrangler d1 create trivia-game` and replaces it.

```sh
export CLOUDFLARE_API_TOKEN=...   # template "Edit Cloudflare Workers"
export CLOUDFLARE_ACCOUNT_ID=...
pnpm run cf:deploy                # type-check, build, upload
pnpm run db:migrate:remote        # create the scores table (run again after adding a migration)
```

Or use the GitHub Actions workflow (add the two secrets above; it deploys after the checks pass on the default branch and does nothing while they are missing), or Cloudflare Workers Builds with build command `pnpm build`, deploy command `pnpm exec wrangler deploy`, and the dashboard's default `npx wrangler preview` for other branches (it needs the `previews` block already in `wrangler.jsonc`). `pnpm install` runs `scripts/prepare.mjs`, which builds the app when Cloudflare's `WORKERS_CI=1` is set, so an empty build command still works. The token that Workers Builds creates by itself cannot edit D1, so keep the `database_id` committed and apply migrations with `pnpm run db:migrate:remote` (or let the Actions workflow do it).

## Version notes

- **TypeScript 6.0, not 7**: `vue-tsc` 3.3 loads TypeScript internals that TypeScript 7 no longer exposes (it fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`). Move up when `vue-tsc` supports 7; Dependabot is told to leave the major alone.
- **Biome skips `.vue` files**: it cannot see template usage inside `<script setup>`, so it reported used imports as unused. `vue-tsc` with `noUnusedLocals` is template-aware and covers that.
- **pnpm 11, not 12**: pnpm 12 cannot be launched through Corepack 0.34 yet. `@types/node` stays on 22, the oldest supported Node.
- **`undici` and `zod` overrides** in `pnpm-workspace.yaml` keep Wrangler's local-dev tooling on patched releases.

## Ideas to extend

Not built, but the seams exist:

- **AI-generated questions**: a Supabase Edge Function asks an LLM for questions in the bank's JSON shape, then `questionSchema` plus `validateBank` reject anything malformed. Add an LLM-as-judge pass and track pass rates in LangSmith.
- **Live rooms**: Supabase Realtime Broadcast for a Kahoot-style shared game.
- **MCP server**: expose `get_daily_questions` and `submit_answer` as tools so an agent can take the quiz; compare models by score.
- **n8n**: post the daily top five to Slack each evening from the `daily_top` view.

© 2019-2026 Paul Xu.
