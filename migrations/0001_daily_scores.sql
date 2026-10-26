-- One row per player per daily challenge. player_id is a random UUID made in the browser;
-- no accounts or personal data are stored, only the nickname the player chooses to post.
CREATE TABLE daily_scores (
  day        TEXT    NOT NULL,
  player_id  TEXT    NOT NULL,
  nickname   TEXT    NOT NULL CHECK (length(nickname) BETWEEN 1 AND 24),
  points     INTEGER NOT NULL CHECK (points >= 0),
  correct    INTEGER NOT NULL CHECK (correct >= 0),
  total      INTEGER NOT NULL CHECK (total BETWEEN 1 AND 20),
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (day, player_id),
  CHECK (correct <= total)
) STRICT, WITHOUT ROWID;

-- Serves "top N for a day" straight from the index.
CREATE INDEX daily_scores_ranking ON daily_scores (day, points DESC, created_at);
