export interface TopRow {
  nickname: string;
  points: number;
  correct: number;
  total: number;
}

export interface NewScore {
  playerId: string;
  nickname: string;
  points: number;
  correct: number;
  total: number;
}

/** A player's first score for the day stands: a repeat insert changes nothing. */
const INSERT_FIRST = `
  INSERT INTO daily_scores (day, player_id, nickname, points, correct, total)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6)
  ON CONFLICT (day, player_id) DO NOTHING`;

const SELECT_TOP = `
  SELECT nickname, points, correct, total
  FROM daily_scores
  WHERE day = ?1
  ORDER BY points DESC, created_at ASC
  LIMIT ?2`;

/** Returns true for a new score and false when the player had already posted one that day. */
export async function saveScore(db: D1Database, day: string, score: NewScore): Promise<boolean> {
  const result = await db
    .prepare(INSERT_FIRST)
    .bind(day, score.playerId, score.nickname, score.points, score.correct, score.total)
    .run();
  return result.meta.changes > 0;
}

export async function readTop(db: D1Database, day: string, limit: number): Promise<TopRow[]> {
  const { results } = await db.prepare(SELECT_TOP).bind(day, limit).all<TopRow>();
  return results;
}
