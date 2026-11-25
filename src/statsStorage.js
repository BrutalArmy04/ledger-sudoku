/* ============================================================
   STATS STORAGE — the edge between the pure stats module and a
   shared storage area (localStorage, which every open tab shares).

   Storage and the event target are passed in, so this is tested with
   fakes in statsStorage.test.js.
   ============================================================ */

import { readStats, saveStats } from "./stats.js";

// Read-modify-write: apply `change` to the stats as stored right now, not
// to this tab's copy, so another tab's update since our last read isn't
// overwritten. Writes nothing when `change` returns its input unchanged.
export function updateStoredStats(storage, key, change) {
  const current = readStats(storage, key);
  const next = change(current);
  if (next !== current) saveStats(storage, next, key);
  return next;
}

// Calls onChange with the stored stats when another tab writes them. Only
// refreshes: never records an abandon. Returns an unsubscribe function.
export function watchStoredStats(target, storage, key, onChange) {
  const onStorage = (e) => {
    // key is null when another tab cleared all of storage
    if (e.key !== key && e.key !== null) return;
    onChange(readStats(storage, key));
  };
  target.addEventListener("storage", onStorage);
  return () => target.removeEventListener("storage", onStorage);
}
