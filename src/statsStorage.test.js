import { describe, test, expect } from "vitest";
import { emptyStats, recordStart, recordWin, recordAbandon, loadStats, saveStats, readStats } from "./stats.js";
import { updateStoredStats, watchStoredStats } from "./statsStorage.js";

// In-memory stand-in for localStorage that counts writes. Several "tabs"
// share one instance, the way every tab of an origin shares localStorage.
function fakeStorage(initial = {}) {
  const data = { ...initial };
  const st = {
    data,
    writes: 0,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      st.writes++;
      data[k] = String(v);
    },
  };
  return st;
}

const KEY = "test_stats";
const win = (s) => recordWin(s, { difficulty: "Easy", seconds: 100 });
const stored = (st) => JSON.parse(st.data[KEY]);

describe("updateStoredStats (read-modify-write)", () => {
  test("another tab's writes between two updates are not lost", () => {
    const st = fakeStorage();
    // Tab A wins a game.
    updateStoredStats(st, KEY, recordStart);
    updateStoredStats(st, KEY, win);
    // Tab C opens now and holds a copy with 1 won.
    const staleC = loadStats(st, KEY);
    // Tab A wins again.
    updateStoredStats(st, KEY, recordStart);
    updateStoredStats(st, KEY, win);
    // Tab C's first move: applied to what is stored, not to its stale copy.
    const next = updateStoredStats(st, KEY, recordStart);
    expect(stored(st)).toMatchObject({ gamesWon: 2, gamesPlayed: 3, gameInProgress: true });
    expect(next).toEqual(stored(st));

    // The old path (apply to the tab's own copy, save the whole object)
    // would have erased A's second win.
    const old = fakeStorage();
    saveStats(old, recordStart(staleC), KEY);
    expect(stored(old)).toMatchObject({ gamesWon: 1, gamesPlayed: 2 });
  });

  test("applies the change to the stored stats and returns what it saved", () => {
    const st = fakeStorage();
    saveStats(st, win(emptyStats()), KEY);
    const next = updateStoredStats(st, KEY, recordStart);
    expect(next.gamesPlayed).toBe(2);
    expect(stored(st)).toEqual(next);
  });

  test("writes nothing when the change is a no-op", () => {
    const st = fakeStorage();
    saveStats(st, win(emptyStats()), KEY);
    st.writes = 0;
    updateStoredStats(st, KEY, recordAbandon); // no game in progress
    expect(st.writes).toBe(0);
  });

  test("never applies the load-time abandon to a game in progress", () => {
    const st = fakeStorage();
    saveStats(st, recordStart(win(emptyStats())), KEY);
    const next = updateStoredStats(st, KEY, recordStart);
    expect(next).toMatchObject({ gamesPlayed: 2, currentStreak: 1, gameInProgress: true });
  });

  test("corrupt stored JSON is repaired before the change is applied", () => {
    const st = fakeStorage({ [KEY]: "{not json" });
    const next = updateStoredStats(st, KEY, recordStart);
    expect(next).toEqual(recordStart(emptyStats()));
    expect(stored(st)).toEqual(next);
  });

  test("storage that throws is tolerated", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(updateStoredStats(broken, KEY, recordStart)).toEqual(recordStart(emptyStats()));
  });
});

describe("watchStoredStats", () => {
  const storageEvent = (key) => Object.assign(new Event("storage"), { key });

  test("reports the stored stats when our key changes, without abandoning", () => {
    const st = fakeStorage();
    const target = new EventTarget();
    const seen = [];
    watchStoredStats(target, st, KEY, (s) => seen.push(s));
    saveStats(st, recordStart(emptyStats()), KEY); // another tab's write
    target.dispatchEvent(storageEvent(KEY));
    expect(seen).toEqual([recordStart(emptyStats())]);
    expect(seen[0].gameInProgress).toBe(true);
  });

  test("ignores other keys; a clear (key null) reports empty stats", () => {
    const st = fakeStorage();
    const target = new EventTarget();
    const seen = [];
    watchStoredStats(target, st, KEY, (s) => seen.push(s));
    target.dispatchEvent(storageEvent("sudoku_settings_v1"));
    expect(seen).toEqual([]);
    target.dispatchEvent(storageEvent(null));
    expect(seen).toEqual([emptyStats()]);
  });

  test("the returned function unsubscribes", () => {
    const target = new EventTarget();
    const seen = [];
    const stop = watchStoredStats(target, fakeStorage(), KEY, (s) => seen.push(s));
    stop();
    target.dispatchEvent(storageEvent(KEY));
    expect(seen).toEqual([]);
  });
});

describe("readStats", () => {
  test("keeps a game in progress (no load-time abandon)", () => {
    const st = fakeStorage();
    const s = recordStart(win(emptyStats()));
    saveStats(st, s, KEY);
    expect(readStats(st, KEY)).toEqual(s);
    expect(loadStats(st, KEY).gameInProgress).toBe(false);
  });
});
