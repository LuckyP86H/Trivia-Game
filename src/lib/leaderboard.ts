/**
 * The optional online leaderboard on Supabase. The game is fully playable without it: when no
 * project is configured, or a request fails, every function here reports that quietly.
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

/** Loads supabase-js only when a project is configured, keeping it out of the main bundle. */
export async function createLeaderboard(env: {
  url?: string;
  key?: string;
}): Promise<Leaderboard | null> {
  if (!env.url || !env.key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return makeLeaderboard(createClient(env.url, env.key) as unknown as SupabaseLike);
}
