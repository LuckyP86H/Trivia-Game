/**
 * The optional online leaderboard. It talks either to this site's own Cloudflare Worker (D1) or,
 * when a Supabase project is configured, to Supabase. The game is fully playable without it: when
 * no backend answers, or a request fails, every function here reports that quietly.
 */

export interface TopScore {
  readonly nickname: string;
  readonly points: number;
  readonly correct: number;
  readonly total: number;
}

export interface NewScore {
  readonly nickname: string;
  readonly day: string;
  readonly points: number;
  readonly correct: number;
  readonly total: number;
}

export interface Leaderboard {
  submitDaily(score: NewScore): Promise<"saved" | "already-submitted" | "failed">;
  topDaily(day: string, limit?: number): Promise<TopScore[] | null>;
}

/** The slice of supabase-js this module uses, so tests can pass a fake. */
export interface SupabaseLike {
  auth: {
    getSession(): Promise<{ data: { session: unknown | null } }>;
    signInAnonymously(): Promise<{ error: unknown | null }>;
  };
  schema(name: string): {
    from(table: string): {
      insert(row: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }>;
      select(columns: string): {
        eq(
          column: string,
          value: string,
        ): {
          order(
            column: string,
            options: { ascending: boolean },
          ): {
            limit(n: number): PromiseLike<{ data: TopScore[] | null; error: unknown | null }>;
          };
        };
      };
    };
  };
}

const UNIQUE_VIOLATION = "23505";

export function makeLeaderboard(client: SupabaseLike): Leaderboard {
  async function ensureSession(): Promise<boolean> {
    const { data } = await client.auth.getSession();
    if (data.session) return true;
    const { error } = await client.auth.signInAnonymously();
    return error === null;
  }

  return {
    async submitDaily(score) {
      try {
        if (!(await ensureSession())) return "failed";
        const { error } = await client
          .schema("trivia")
          .from("scores")
          .insert({ ...score, nickname: score.nickname.trim(), mode: "daily" });
        if (!error) return "saved";
        return error.code === UNIQUE_VIOLATION ? "already-submitted" : "failed";
      } catch {
        return "failed";
      }
    },
    async topDaily(day, limit = 10) {
      try {
        const { data, error } = await client
          .schema("trivia")
          .from("daily_top")
          .select("nickname, points, correct, total")
          .eq("day", day)
          .order("points", { ascending: false })
          .limit(limit);
        return error ? null : data;
      } catch {
        return null;
      }
    },
  };
}

/** A fetch-like function, so tests can pass a fake instead of the network. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const API_TIMEOUT_MS = 8000;

/** The leaderboard served by this site's own Worker under /api. */
export function makeApiLeaderboard(fetchApi: FetchLike, playerId: string): Leaderboard {
  const request = (path: string, init?: RequestInit) =>
    fetchApi(path, { ...init, signal: AbortSignal.timeout(API_TIMEOUT_MS) });

  return {
    async submitDaily(score) {
      try {
        const { day, ...rest } = score;
        const response = await request(`/api/daily/${day}/scores`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...rest, nickname: score.nickname.trim(), playerId }),
        });
        if (response.status === 201) return "saved";
        if (response.status === 200) return "already-submitted";
        return "failed";
      } catch {
        return "failed";
      }
    },
    async topDaily(day, limit = 10) {
      try {
        // The Worker allows a short shared cache; the player's own browser must still revalidate, or it
        // would show the list from before they posted.
        const response = await request(`/api/daily/${day}/top`, { cache: "no-cache" });
        if (!response.ok) return null;
        const body = (await response.json()) as { top?: TopScore[] };
        return Array.isArray(body.top) ? body.top.slice(0, limit) : null;
      } catch {
        return null;
      }
    },
  };
}

/** True only when a Worker answers /api/health, so a static host without one stays offline. */
async function apiAvailable(fetchApi: FetchLike): Promise<boolean> {
  try {
    const response = await fetchApi("/api/health", { signal: AbortSignal.timeout(API_TIMEOUT_MS) });
    const body = (await response.json()) as { ok?: unknown };
    return response.ok && body.ok === true;
  } catch {
    return false;
  }
}

export interface LeaderboardConfig {
  /** Supabase project URL and publishable key. Optional: they take priority when both are set. */
  url?: string;
  key?: string;
  /** The random per-browser id used by the Worker backend. */
  playerId?: string;
  fetchApi?: FetchLike;
}

/**
 * Picks the backend: Supabase when configured (loading supabase-js lazily, to keep it out of the
 * main bundle), otherwise this site's Worker if it answers. Null means "play offline".
 */
export async function createLeaderboard(config: LeaderboardConfig): Promise<Leaderboard | null> {
  if (config.url && config.key) {
    const { createClient } = await import("@supabase/supabase-js");
    return makeLeaderboard(createClient(config.url, config.key) as unknown as SupabaseLike);
  }
  const fetchApi: FetchLike = config.fetchApi ?? ((input, init) => fetch(input, init));
  if (!config.playerId || !(await apiAvailable(fetchApi))) return null;
  return makeApiLeaderboard(fetchApi, config.playerId);
}
