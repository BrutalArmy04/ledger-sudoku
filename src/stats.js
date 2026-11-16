/* ============================================================
   STATS — pure bookkeeping for games played / won / streaks

   A game counts as "played" from its first answer on the board (a placed
   digit or a hint; notes don't count). From then until it is won, the
   stats carry gameInProgress = true. Leaving it unfinished -- back to the
   menu, starting another puzzle, or closing the app -- is an abandon,
   which resets the current streak. A close is detected on the next launch:
   loadStats() finds gameInProgress still set and records the abandon then.

   Every function returns a new object and never mutates its input, so the
   app can keep stats in React state and these can be tested in isolation.
   ============================================================ */

export function emptyStats() {
  return {
    gamesPlayed: 0,
    gamesWon: 0,
    bestTimes: {},
    totalTimes: {},
    completions: {},
    currentStreak: 0,
    bestStreak: 0,
    gameInProgress: false,
  };
}

// First answer of a game. Idempotent while that game is in progress.
export function recordStart(stats) {
  if (stats.gameInProgress) return stats;
  return { ...stats, gamesPlayed: stats.gamesPlayed + 1, gameInProgress: true };
}

export function recordWin(stats, { difficulty, seconds }) {
  // A win always belongs to a played game, even if its start was never recorded.
  const s = recordStart(stats);
  const currentStreak = s.currentStreak + 1;
  const best = s.bestTimes[difficulty];
  return {
    ...s,
    gamesWon: s.gamesWon + 1,
    currentStreak,
    bestStreak: Math.max(s.bestStreak, currentStreak),
    bestTimes: { ...s.bestTimes, [difficulty]: best === undefined ? seconds : Math.min(best, seconds) },
    totalTimes: { ...s.totalTimes, [difficulty]: [...(s.totalTimes[difficulty] || []), seconds] },
    completions: { ...s.completions, [difficulty]: (s.completions[difficulty] || 0) + 1 },
    gameInProgress: false,
  };
}

// Leaving a started, unfinished game. No-op if no game is in progress.
export function recordAbandon(stats) {
  if (!stats.gameInProgress) return stats;
  return { ...stats, currentStreak: 0, gameInProgress: false };
}

/* ---------- persistence ---------- */

const isCount = (v) => Number.isInteger(v) && v >= 0;
const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function pickEntries(obj, valid) {
  if (!isPlainObject(obj)) return {};
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => valid(v)));
}

// Validate field by field, so one bad value doesn't throw away the rest.
function normalize(raw) {
  const base = emptyStats();
  if (!isPlainObject(raw)) return base;
  const count = (k) => (isCount(raw[k]) ? raw[k] : base[k]);
  const s = {
    gamesPlayed: count("gamesPlayed"),
    gamesWon: count("gamesWon"),
    bestTimes: pickEntries(raw.bestTimes, isCount),
    totalTimes: pickEntries(raw.totalTimes, (v) => Array.isArray(v) && v.every(isCount)),
    completions: pickEntries(raw.completions, isCount),
    currentStreak: count("currentStreak"),
    bestStreak: count("bestStreak"),
    gameInProgress: raw.gameInProgress === true,
  };
  s.gamesPlayed = Math.max(s.gamesPlayed, s.gamesWon);
  s.bestStreak = Math.max(s.bestStreak, s.currentStreak);
  return s;
}

export function loadStats(storage, key) {
  let raw = null;
  try {
    const text = storage.getItem(key);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  // A game still marked in progress was left by closing the app.
  return recordAbandon(normalize(raw));
}

export function saveStats(storage, stats, key) {
  try {
    storage.setItem(key, JSON.stringify(stats));
  } catch {
    // ignore write failures (e.g. storage disabled or full)
  }
}
