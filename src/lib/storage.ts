import { EMPTY_PROGRESS, type Progress, parseProgress } from "./progress";

const KEY = "stack-quiz:v1:progress";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage can throw (private windows, blocked cookies), so a missing store is normal. */
export function browserStore(): KeyValueStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(store: KeyValueStore | null = browserStore()): Progress {
  try {
    const raw = store?.getItem(KEY);
    return raw ? parseProgress(JSON.parse(raw)) : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(
  progress: Progress,
  store: KeyValueStore | null = browserStore(),
): void {
  try {
    store?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the game still works, it just will not remember.
  }
}

const PLAYER_KEY = "stack-quiz:v1:player";

/**
 * A random id that tells one browser's leaderboard score from another's. It holds no personal
 * data. When storage is blocked a fresh id is made each visit, so a repeat post is still possible.
 */
export function loadPlayerId(store: KeyValueStore | null = browserStore()): string {
  try {
    const saved = store?.getItem(PLAYER_KEY);
    if (saved) return saved;
    const id = crypto.randomUUID();
    store?.setItem(PLAYER_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
