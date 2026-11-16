import { describe, test, expect } from "vitest";
import {
  emptyStats,
  recordStart,
  recordWin,
  recordAbandon,
  loadStats,
  saveStats,
} from "./stats.js";

// A minimal in-memory stand-in for window.localStorage.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

const KEY = "test_stats";

// Replay a script of game events from a fresh state. Each step is
// "start" | "abandon" | ["win", difficulty, seconds].
function play(steps, from = emptyStats()) {
  return steps.reduce((s, step) => {
    if (step === "start") return recordStart(s);
    if (step === "abandon") return recordAbandon(s);
    const [, difficulty, seconds] = step;
    return recordWin(s, { difficulty, seconds });
  }, from);
}

function deepFreeze(o) {
  Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v));
  return Object.freeze(o);
}

describe("stats bookkeeping", () => {
  test("a started-then-won game counts as one played and one won", () => {
    const s = play(["start", ["win", "Easy", 100]]);
    expect(s.gamesPlayed).toBe(1);
    expect(s.gamesWon).toBe(1);
    expect(s.currentStreak).toBe(1);
    expect(s.gameInProgress).toBe(false);
  });

  test("an abandoned game counts as played, not won, and resets the streak", () => {
    const s = play(["start", ["win", "Easy", 100], "start", "abandon"]);
    expect(s.gamesPlayed).toBe(2);
    expect(s.gamesWon).toBe(1);
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(1);
    expect(s.gameInProgress).toBe(false);
  });

  test("win, win, abandon, win -> streak 1, best streak 2, 3 of 4 won", () => {
    const s = play([
      "start", ["win", "Easy", 100],
      "start", ["win", "Easy", 90],
      "start", "abandon",
      "start", ["win", "Hard", 300],
    ]);
    expect(s.gamesPlayed).toBe(4);
    expect(s.gamesWon).toBe(3);
    expect(s.currentStreak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  test("starting is idempotent within one game", () => {
    const s = play(["start", "start", "start"]);
    expect(s.gamesPlayed).toBe(1);
    expect(s.gameInProgress).toBe(true);
  });

  test("abandoning when no game is in progress changes nothing", () => {
    const won = play(["start", ["win", "Easy", 100]]);
    expect(recordAbandon(won)).toEqual(won);
    expect(recordAbandon(emptyStats())).toEqual(emptyStats());
  });

  test("a win without a recorded start still counts as played", () => {
    const s = play([["win", "Medium", 200]]);
    expect(s.gamesPlayed).toBe(1);
    expect(s.gamesWon).toBe(1);
  });

  test("best time keeps the minimum; completions and times are per difficulty", () => {
    const s = play([
      "start", ["win", "Easy", 120],
      "start", ["win", "Easy", 80],
      "start", ["win", "Easy", 95],
      "start", ["win", "Hard", 400],
    ]);
    expect(s.bestTimes).toEqual({ Easy: 80, Hard: 400 });
    expect(s.completions).toEqual({ Easy: 3, Hard: 1 });
    expect(s.totalTimes).toEqual({ Easy: [120, 80, 95], Hard: [400] });
  });

  test("a 0-second best time is kept (falsy values are still values)", () => {
    const s = play(["start", ["win", "Easy", 0], "start", ["win", "Easy", 5]]);
    expect(s.bestTimes.Easy).toBe(0);
  });

  test("invariants hold over a long random history", () => {
    let s = emptyStats();
    let rng = 12345;
    const rand = () => (rng = (rng * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 500; i++) {
      const r = rand();
      if (r < 0.4) s = recordStart(s);
      else if (r < 0.7) s = recordWin(s, { difficulty: "Easy", seconds: Math.floor(rand() * 600) });
      else s = recordAbandon(s);
      expect(s.gamesWon).toBeLessThanOrEqual(s.gamesPlayed);
      expect(s.currentStreak).toBeLessThanOrEqual(s.bestStreak);
      expect(s.currentStreak).toBeGreaterThanOrEqual(0);
    }
  });

  test("record functions never mutate their input", () => {
    const base = deepFreeze(play(["start", ["win", "Easy", 100], "start"]));
    expect(() => recordStart(base)).not.toThrow();
    expect(() => recordWin(base, { difficulty: "Easy", seconds: 50 })).not.toThrow();
    expect(() => recordAbandon(base)).not.toThrow();
  });
});

describe("stats persistence", () => {
  test("save then load round-trips a finished history", () => {
    const st = fakeStorage();
    const s = play(["start", ["win", "Easy", 100], "start", "abandon", "start", ["win", "Master", 900]]);
    saveStats(st, s, KEY);
    expect(loadStats(st, KEY)).toEqual(s);
  });

  test("nothing saved -> empty stats", () => {
    expect(loadStats(fakeStorage(), KEY)).toEqual(emptyStats());
  });

  test.each([
    ["corrupt JSON", "{not json"],
    ["null", "null"],
    ["an array", "[1,2,3]"],
    ["a number", "42"],
  ])("%s -> empty stats", (_, raw) => {
    expect(loadStats(fakeStorage({ [KEY]: raw }), KEY)).toEqual(emptyStats());
  });

  test("missing or invalid fields fall back to defaults individually", () => {
    const raw = JSON.stringify({
      gamesPlayed: 5,
      gamesWon: "lots",
      bestTimes: { Easy: 60, Hard: "fast", Medium: -3 },
      completions: [],
      currentStreak: 2.5,
    });
    const s = loadStats(fakeStorage({ [KEY]: raw }), KEY);
    expect(s.gamesPlayed).toBe(5);
    expect(s.gamesWon).toBe(0);
    expect(s.bestTimes).toEqual({ Easy: 60 });
    expect(s.completions).toEqual({});
    expect(s.totalTimes).toEqual({});
    expect(s.currentStreak).toBe(0);
    expect(s.bestStreak).toBe(0);
    expect(s.gameInProgress).toBe(false);
  });

  test("loaded data is repaired so that won <= played and streak <= best", () => {
    const raw = JSON.stringify({ gamesPlayed: 1, gamesWon: 4, currentStreak: 3, bestStreak: 1 });
    const s = loadStats(fakeStorage({ [KEY]: raw }), KEY);
    expect(s.gamesWon).toBeLessThanOrEqual(s.gamesPlayed);
    expect(s.currentStreak).toBeLessThanOrEqual(s.bestStreak);
  });

  test("a game left in progress (app closed mid-game) loads as abandoned", () => {
    const st = fakeStorage();
    saveStats(st, play(["start", ["win", "Easy", 100], "start"]), KEY);
    const s = loadStats(st, KEY);
    expect(s.gamesPlayed).toBe(2);
    expect(s.gamesWon).toBe(1);
    expect(s.currentStreak).toBe(0);
    expect(s.gameInProgress).toBe(false);
  });

  test("storage that throws is tolerated on both load and save", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadStats(broken, KEY)).toEqual(emptyStats());
    expect(() => saveStats(broken, emptyStats(), KEY)).not.toThrow();
  });
});
