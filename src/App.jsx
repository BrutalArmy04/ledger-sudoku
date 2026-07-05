import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";

/* ============================================================
   ENGINE — generator, solver, grader
   ============================================================ */

const SIZE = 9;
const BOX = 3;

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function cloneGrid(g) {
  return g.map((r) => r.slice());
}

function peers(r, c) {
  const list = [];
  for (let i = 0; i < SIZE; i++) {
    if (i !== c) list.push([r, i]);
    if (i !== r) list.push([i, c]);
  }
  const br = Math.floor(r / BOX) * BOX;
  const bc = Math.floor(c / BOX) * BOX;
  for (let i = br; i < br + BOX; i++) {
    for (let j = bc; j < bc + BOX; j++) {
      if (i !== r || j !== c) list.push([i, j]);
    }
  }
  return list;
}

function candidates(grid, r, c) {
  if (grid[r][c] !== 0) return [];
  const used = new Set();
  for (const [pr, pc] of peers(r, c)) {
    if (grid[pr][pc] !== 0) used.add(grid[pr][pc]);
  }
  const out = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n);
  return out;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fill a board completely via randomized backtracking
function fillBoard(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) {
        const opts = shuffle(candidates(grid, r, c));
        for (const n of opts) {
          grid[r][c] = n;
          if (fillBoard(grid)) return true;
          grid[r][c] = 0;
        }
        return false;
      }
    }
  }
  return true;
}

function generateSolvedBoard() {
  const g = emptyGrid();
  fillBoard(g);
  return g;
}

// Count solutions up to a cap (2 is enough to know "not unique")
function countSolutions(grid, cap = 2) {
  let count = 0;
  function backtrack(g) {
    if (count >= cap) return;
    let br = -1, bc = -1, bestLen = 10;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === 0) {
          const len = candidates(g, r, c).length;
          if (len < bestLen) {
            bestLen = len;
            br = r; bc = c;
            if (len === 0) { r = SIZE; break; }
          }
        }
      }
    }
    if (br === -1) { count++; return; }
    if (bestLen === 0) return;
    for (const n of candidates(g, br, bc)) {
      g[br][bc] = n;
      backtrack(g);
      g[br][bc] = 0;
      if (count >= cap) return;
    }
  }
  backtrack(cloneGrid(grid));
  return count;
}

// Human-style logical solver used for grading difficulty.
// Returns { solved: bool, techniques: Set<string> }
function logicalSolve(grid) {
  const g = cloneGrid(grid);
  const techniques = new Set();
  const notes = Array.from({ length: SIZE }, (_, r) =>
    Array.from({ length: SIZE }, (_, c) => new Set(candidates(g, r, c)))
  );

  function recomputeNotesAround(r, c) {
    for (const [pr, pc] of peers(r, c)) {
      if (g[pr][pc] === 0) notes[pr][pc].delete(g[r][c]);
    }
  }

  function place(r, c, n) {
    g[r][c] = n;
    notes[r][c] = new Set();
    recomputeNotesAround(r, c);
  }

  function isSolved() {
    return g.every((row) => row.every((v) => v !== 0));
  }

  function units() {
    const list = [];
    for (let r = 0; r < SIZE; r++) list.push(Array.from({ length: SIZE }, (_, c) => [r, c]));
    for (let c = 0; c < SIZE; c++) list.push(Array.from({ length: SIZE }, (_, r) => [r, c]));
    for (let br = 0; br < SIZE; br += BOX) {
      for (let bc = 0; bc < SIZE; bc += BOX) {
        const cells = [];
        for (let r = br; r < br + BOX; r++)
          for (let c = bc; c < bc + BOX; c++) cells.push([r, c]);
        list.push(cells);
      }
    }
    return list;
  }

  let progress = true;
  let iterations = 0;
  const MAX_ITER = 400;

  while (progress && !isSolved() && iterations < MAX_ITER) {
    progress = false;
    iterations++;

    // Naked Single
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (g[r][c] === 0 && notes[r][c].size === 1) {
          place(r, c, [...notes[r][c]][0]);
          techniques.add("Naked Single");
          progress = true;
        }
      }
    }
    if (progress) continue;

    // Hidden Single
    for (const unit of units()) {
      for (let n = 1; n <= 9; n++) {
        const cellsWithN = unit.filter(([r, c]) => g[r][c] === 0 && notes[r][c].has(n));
        if (cellsWithN.length === 1) {
          const [r, c] = cellsWithN[0];
          place(r, c, n);
          techniques.add("Hidden Single");
          progress = true;
        }
      }
    }
    if (progress) continue;

    // Naked Pair -> eliminate from peers in shared units
    for (const unit of units()) {
      const empties = unit.filter(([r, c]) => g[r][c] === 0);
      for (let i = 0; i < empties.length; i++) {
        for (let j = i + 1; j < empties.length; j++) {
          const [r1, c1] = empties[i];
          const [r2, c2] = empties[j];
          if (notes[r1][c1].size === 2 && notes[r2][c2].size === 2) {
            const a = [...notes[r1][c1]].sort().join(",");
            const b = [...notes[r2][c2]].sort().join(",");
            if (a === b) {
              const pairVals = [...notes[r1][c1]];
              for (const [r, c] of unit) {
                if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
                if (g[r][c] === 0) {
                  let changed = false;
                  for (const v of pairVals) {
                    if (notes[r][c].has(v)) {
                      notes[r][c].delete(v);
                      changed = true;
                    }
                  }
                  if (changed) {
                    techniques.add("Naked Pairs");
                    progress = true;
                  }
                }
              }
            }
          }
        }
      }
    }
    if (progress) continue;

    // Pointing Pairs (box -> line elimination), simplified X-Wing-ish technique
    for (let n = 1; n <= 9; n++) {
      for (let br = 0; br < SIZE; br += BOX) {
        for (let bc = 0; bc < SIZE; bc += BOX) {
          const cells = [];
          for (let r = br; r < br + BOX; r++)
            for (let c = bc; c < bc + BOX; c++)
              if (g[r][c] === 0 && notes[r][c].has(n)) cells.push([r, c]);
          if (cells.length === 2 || cells.length === 3) {
            const rows = new Set(cells.map((x) => x[0]));
            const cols = new Set(cells.map((x) => x[1]));
            if (rows.size === 1) {
              const r = [...rows][0];
              for (let c = 0; c < SIZE; c++) {
                if (c >= bc && c < bc + BOX) continue;
                if (g[r][c] === 0 && notes[r][c].has(n)) {
                  notes[r][c].delete(n);
                  techniques.add("Pointing Pairs");
                  progress = true;
                }
              }
            }
            if (cols.size === 1) {
              const c = [...cols][0];
              for (let r = 0; r < SIZE; r++) {
                if (r >= br && r < br + BOX) continue;
                if (g[r][c] === 0 && notes[r][c].has(n)) {
                  notes[r][c].delete(n);
                  techniques.add("Pointing Pairs");
                  progress = true;
                }
              }
            }
          }
        }
      }
    }
  }

  return { solved: isSolved(), techniques };
}

const DIFFICULTY_TARGETS = {
  Easy: { minClues: 38, maxClues: 45 },
  Medium: { minClues: 32, maxClues: 37 },
  Hard: { minClues: 28, maxClues: 31 },
  Expert: { minClues: 24, maxClues: 27 },
  Master: { minClues: 17, maxClues: 23 },
};

// Tiers are cumulative: each tier's technique set is a superset of easier tiers.
// A puzzle's "technique tier" is the tier of the hardest technique it required.
const TECHNIQUE_TIER = {
  "Naked Single": 0,
  "Hidden Single": 0,
  "Naked Pairs": 1,
  "Pointing Pairs": 2,
};
const TIER_NAMES = ["Easy", "Medium", "Hard", "Expert"]; // index = tier; unsolved -> Master

function gradeDifficulty(grid) {
  const { solved, techniques } = logicalSolve(grid);
  const clueCount = grid.flat().filter((v) => v !== 0).length;

  if (!solved) return "Master"; // needed deeper backtracking-style logic -> hardest

  let maxTier = 0;
  for (const tech of techniques) {
    const tier = TECHNIQUE_TIER[tech] ?? 0;
    if (tier > maxTier) maxTier = tier;
  }
  const techniqueDifficulty = TIER_NAMES[maxTier] || "Expert";

  // Also derive a difficulty purely from clue count, then take whichever is harder,
  // since a sparse puzzle solvable only with easy techniques still plays sparse-hard.
  const order = ["Easy", "Medium", "Hard", "Expert", "Master"];
  let clueDifficulty = "Master";
  for (const diff of order) {
    if (clueCount >= DIFFICULTY_TARGETS[diff].minClues) {
      clueDifficulty = diff;
      break;
    }
  }

  const idx = (d) => order.indexOf(d);
  return idx(techniqueDifficulty) > idx(clueDifficulty) ? techniqueDifficulty : clueDifficulty;
}

// Dig holes from a solved board until target clue count / difficulty reached
function generatePuzzleOnce(difficulty) {
  const target = DIFFICULTY_TARGETS[difficulty];
  const solved = generateSolvedBoard();
  const puzzle = cloneGrid(solved);
  const cellOrder = shuffle(
    Array.from({ length: SIZE * SIZE }, (_, i) => [Math.floor(i / SIZE), i % SIZE])
  );

  let clueCount = SIZE * SIZE;
  for (const [r, c] of cellOrder) {
    if (clueCount <= target.minClues) break;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      clueCount--;
    } else {
      puzzle[r][c] = backup;
    }
  }

  // Try to refine toward exact target difficulty by digging a bit further if possible
  let actualDifficulty = gradeDifficulty(puzzle);
  let attempts = 0;
  const order = ["Easy", "Medium", "Hard", "Expert", "Master"];
  while (
    order.indexOf(actualDifficulty) < order.indexOf(difficulty) &&
    clueCount > target.minClues - 4 &&
    attempts < 30
  ) {
    const remaining = shuffle(
      cellOrder.filter(([r, c]) => puzzle[r][c] !== 0)
    );
    let dug = false;
    for (const [r, c] of remaining) {
      const backup = puzzle[r][c];
      puzzle[r][c] = 0;
      if (countSolutions(puzzle, 2) === 1) {
        clueCount--;
        dug = true;
        break;
      } else {
        puzzle[r][c] = backup;
      }
    }
    attempts++;
    if (!dug) break;
    actualDifficulty = gradeDifficulty(puzzle);
  }

  return { puzzle, solved, difficulty: actualDifficulty, clueCount };
}

// Generate several candidates and keep the one whose graded difficulty is
// closest to the requested tier, since a single dig pass can over- or undershoot.
function generatePuzzle(difficulty) {
  const order = ["Easy", "Medium", "Hard", "Expert", "Master"];
  const targetIdx = order.indexOf(difficulty);
  let best = null;
  let bestDist = Infinity;
  const MAX_CANDIDATES = 4;

  for (let i = 0; i < MAX_CANDIDATES; i++) {
    const candidate = generatePuzzleOnce(difficulty);
    const dist = Math.abs(order.indexOf(candidate.difficulty) - targetIdx);
    if (dist === 0) return candidate;
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

function solveBoard(grid) {
  const g = cloneGrid(grid);
  fillBoard(g);
  return g;
}

function isValidPlacement(grid, r, c, n) {
  if (n === 0) return true;
  for (const [pr, pc] of peers(r, c)) {
    if (grid[pr][pc] === n) return false;
  }
  return true;
}

function boardIsComplete(grid) {
  return grid.every((row) => row.every((v) => v !== 0));
}

/* ============================================================
   PERSISTENCE
   ============================================================ */

const STORAGE_KEY_STATS = "sudoku_stats_v1";
const STORAGE_KEY_SETTINGS = "sudoku_settings_v1";

function useInMemoryStore(initial) {
  const ref = useRef(initial);
  return ref;
}

// Settings (theme, accent, font scale) persist across app restarts via
// localStorage, which Electron backs with on-disk storage per origin.
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch {
    // ignore write failures (e.g. storage disabled)
  }
}

/* ============================================================
   UI HELPERS
   ============================================================ */

const DIFFICULTIES = ["Easy", "Medium", "Hard", "Expert", "Master"];

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const THEME = {
  light: {
    bg: "#F7F6F3",
    paper: "#FFFFFF",
    ledger: "#E7E4DC",
    text: "#1C1B19",
    textMuted: "#6B6660",
    accent: "#2B4570",
    accentSoft: "#D8E1EC",
    related: "#EDF1F6",
    sameNum: "#E3E9F2",
    error: "#B5524A",
    errorSoft: "#F5E2E0",
    amber: "#C9A227",
    border: "#C9C4B8",
    boxBorder: "#2B4570",
    given: "#1C1B19",
    userNum: "#2B4570",
    note: "#8B9DAF",
  },
  dark: {
    bg: "#15140F",
    paper: "#1C1B19",
    ledger: "#262420",
    text: "#EDEAE3",
    textMuted: "#948E83",
    accent: "#6E8CB8",
    accentSoft: "#26344A",
    related: "#23282F",
    sameNum: "#2A3848",
    error: "#D1736B",
    errorSoft: "#3A2420",
    amber: "#D9B64A",
    border: "#3A3631",
    boxBorder: "#6E8CB8",
    given: "#EDEAE3",
    userNum: "#8FAAD1",
    note: "#7C8FA6",
  },
};

// Accent presets only override the small set of theme keys tied to the
// "ink" color — everything else (paper, background, borders, neutral
// text) stays as defined in THEME above, for both light and dark mode.
const ACCENT_PRESETS = {
  ink: {
    label: "Ink Blue",
    swatch: "#2B4570",
    light: { accent: "#2B4570", accentSoft: "#D8E1EC", sameNum: "#E3E9F2", boxBorder: "#2B4570", userNum: "#2B4570" },
    dark: { accent: "#6E8CB8", accentSoft: "#26344A", sameNum: "#2A3848", boxBorder: "#6E8CB8", userNum: "#8FAAD1" },
  },
  forest: {
    label: "Forest",
    swatch: "#2F5233",
    light: { accent: "#2F5233", accentSoft: "#DCE8DC", sameNum: "#E1ECE1", boxBorder: "#2F5233", userNum: "#2F5233" },
    dark: { accent: "#6FA37A", accentSoft: "#233A28", sameNum: "#27402C", boxBorder: "#6FA37A", userNum: "#8FC29B" },
  },
  burgundy: {
    label: "Burgundy",
    swatch: "#7A2E3A",
    light: { accent: "#7A2E3A", accentSoft: "#EDDCDF", sameNum: "#F0E2E4", boxBorder: "#7A2E3A", userNum: "#7A2E3A" },
    dark: { accent: "#C77B89", accentSoft: "#3A2228", sameNum: "#40262C", boxBorder: "#C77B89", userNum: "#D699A4" },
  },
  plum: {
    label: "Plum",
    swatch: "#4B3F72",
    light: { accent: "#4B3F72", accentSoft: "#E1DCEE", sameNum: "#E6E1F0", boxBorder: "#4B3F72", userNum: "#4B3F72" },
    dark: { accent: "#9C8FC9", accentSoft: "#2E2745", sameNum: "#332B4C", boxBorder: "#9C8FC9", userNum: "#B3A8D9" },
  },
  slate: {
    label: "Slate",
    swatch: "#3F5663",
    light: { accent: "#3F5663", accentSoft: "#DCE5E9", sameNum: "#E2EAEC", boxBorder: "#3F5663", userNum: "#3F5663" },
    dark: { accent: "#7FA2B3", accentSoft: "#27343C", sameNum: "#2B3A42", boxBorder: "#7FA2B3", userNum: "#9CBAC8" },
  },
};

// Base (fontScale === 1) board cell size in px. GameScreen needs this too,
// to size the rows above the board so they stay aligned with its new width.
const BOARD_BASE_CELL = 56;
// Padding (8px * 2) + outer border (1px * 2) added around the grid by Board.
const BOARD_CHROME = 18;

// Font/cell scale: controls both the board's cell size and the font size
// of digits, notes, and the number pad, so larger text always comes with
// a larger tap target.
const FONT_SCALES = {
  standard: { label: "Standard", multiplier: 1 },
  large: { label: "Large", multiplier: 1.15 },
  xlarge: { label: "Extra Large", multiplier: 1.3 },
};

function buildTheme(themeMode, accentKey) {
  const base = THEME[themeMode];
  const preset = ACCENT_PRESETS[accentKey] || ACCENT_PRESETS.ink;
  return { ...base, ...preset[themeMode] };
}

/* ============================================================
   MAIN APP
   ============================================================ */

function SudokuApp() {
  const [themeMode, setThemeMode] = useState(() => loadSettings()?.themeMode || "light");
  const [prefs, setPrefs] = useState(() => loadSettings()?.prefs || { accent: "ink", fontScale: "standard" });
  const T = useMemo(() => buildTheme(themeMode, prefs.accent), [themeMode, prefs.accent]);
  const fontScale = FONT_SCALES[prefs.fontScale]?.multiplier || 1;

  useEffect(() => {
    saveSettings({ themeMode, prefs });
  }, [themeMode, prefs]);

  const [screen, setScreen] = useState("menu"); // menu | game | stats | settings
  const prevScreenRef = useRef("menu");
  const [difficulty, setDifficulty] = useState("Medium");

  const [puzzle, setPuzzle] = useState(null); // original clues grid
  const [solution, setSolution] = useState(null);
  const [grid, setGrid] = useState(null); // current state
  const [notesGrid, setNotesGrid] = useState(null); // Set per cell
  const [selected, setSelected] = useState(null); // [r,c] - selected cell
  const [selectedDigit, setSelectedDigit] = useState(null); // number-pad armed digit (1-9) or null
  const [mode, setMode] = useState("normal"); // normal | notes (keyboard-entry mode)
  const [history, setHistory] = useState([]);
  const [mistakes, setMistakes] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [won, setWon] = useState(false);
  const [autoCheck, setAutoCheck] = useState(true);
  const [flashError, setFlashError] = useState(null);
  const [actualDifficulty, setActualDifficulty] = useState(null);
  const [loading, setLoading] = useState(false);

  const statsRef = useInMemoryStore({
    gamesPlayed: 0,
    gamesWon: 0,
    bestTimes: {},
    totalTimes: {},
    completions: {},
    currentStreak: 0,
    bestStreak: 0,
  });
  const [statsVersion, setStatsVersion] = useState(0);

  const timerRef = useRef(null);

  useEffect(() => {
    if (screen === "game" && !paused && !won) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, paused, won]);

  const startGame = useCallback((diff) => {
    setLoading(true);
    setTimeout(() => {
      const { puzzle: p, solved, difficulty: actual } = generatePuzzle(diff);
      setPuzzle(p);
      setSolution(solved);
      setGrid(cloneGrid(p));
      setNotesGrid(Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => new Set())));
      setSelected(null);
      setSelectedDigit(null);
      setMode("normal");
      setHistory([]);
      setMistakes(0);
      setHintsLeft(3);
      setSeconds(0);
      setPaused(false);
      setWon(false);
      setActualDifficulty(actual);
      setDifficulty(diff);
      setScreen("game");
      setLoading(false);
    }, 30);
  }, []);

  const pushHistory = useCallback((g, n) => {
    setHistory((h) => [...h, { grid: cloneGrid(g), notes: n.map((row) => row.map((s) => new Set(s))) }]);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setGrid(last.grid);
      setNotesGrid(last.notes);
      return h.slice(0, -1);
    });
  }, []);

  const isGiven = useCallback((r, c) => puzzle && puzzle[r][c] !== 0, [puzzle]);

  // Core placement logic, independent of how the cell/number were chosen.
  // Used by both keyboard entry (selected cell + mode) and mouse entry
  // (clicked cell + left/right click).
  const placeNumberAt = useCallback(
    (r, c, n, asNote) => {
      if (!grid || won || paused) return false;
      if (isGiven(r, c)) return false;

      if (asNote) {
        const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
        pushHistory(grid, notesGrid);
        if (newNotes[r][c].has(n)) newNotes[r][c].delete(n);
        else newNotes[r][c].add(n);
        setNotesGrid(newNotes);
        return true;
      }

      pushHistory(grid, notesGrid);
      const newGrid = cloneGrid(grid);
      newGrid[r][c] = n;
      const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
      newNotes[r][c] = new Set();
      // auto-clear pencil marks of n in same row/col/box
      for (const [pr, pc] of peers(r, c)) {
        newNotes[pr][pc].delete(n);
      }

      const correct = solution[r][c] === n;
      if (autoCheck && !correct) {
        setMistakes((m) => m + 1);
        setFlashError([r, c]);
        setTimeout(() => setFlashError(null), 420);
      }

      setGrid(newGrid);
      setNotesGrid(newNotes);

      if (boardIsComplete(newGrid)) {
        const allCorrect = newGrid.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]));
        if (allCorrect) {
          setWon(true);
          const stats = statsRef.current;
          stats.gamesPlayed += 1;
          stats.gamesWon += 1;
          stats.currentStreak += 1;
          stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
          const diffKey = actualDifficulty || difficulty;
          if (!stats.bestTimes[diffKey] || seconds < stats.bestTimes[diffKey]) {
            stats.bestTimes[diffKey] = seconds;
          }
          stats.totalTimes[diffKey] = (stats.totalTimes[diffKey] || []).concat(seconds);
          stats.completions[diffKey] = (stats.completions[diffKey] || 0) + 1;
          setStatsVersion((v) => v + 1);
        }
      }
      return true;
    },
    [grid, notesGrid, won, paused, isGiven, solution, autoCheck, pushHistory, actualDifficulty, difficulty, seconds]
  );

  // Keyboard-entry path: acts on the currently selected cell, using the
  // Notes-mode toggle to decide answer vs note.
  const placeNumber = useCallback(
    (n) => {
      if (!selected) return;
      placeNumberAt(selected[0], selected[1], n, mode === "notes");
    },
    [selected, mode, placeNumberAt]
  );

  // Number-first path (Microsoft Sudoku style): clicking a number pad digit
  // arms it (highlighting every cell that already holds it) without touching
  // any cell yet. With a digit armed, left-clicking a board cell places it as
  // the answer; right-clicking places it as a pencil note.
  const toggleSelectedDigit = useCallback((n) => {
    setSelectedDigit((d) => (d === n ? null : n));
  }, []);

  const handleCellClick = useCallback(
    (r, c) => {
      if (selectedDigit) {
        const placed = placeNumberAt(r, c, selectedDigit, false);
        setSelected(placed ? null : [r, c]);
      } else {
        setSelected([r, c]);
      }
    },
    [selectedDigit, placeNumberAt]
  );

  const handleCellRightClick = useCallback(
    (r, c) => {
      if (selectedDigit) {
        const placed = placeNumberAt(r, c, selectedDigit, true);
        setSelected(placed ? null : [r, c]);
      } else {
        setSelected([r, c]);
      }
    },
    [selectedDigit, placeNumberAt]
  );

  const clearCell = useCallback(() => {
    if (!selected || !grid || won || paused) return;
    const [r, c] = selected;
    if (isGiven(r, c)) return;
    pushHistory(grid, notesGrid);
    const newGrid = cloneGrid(grid);
    newGrid[r][c] = 0;
    setGrid(newGrid);
  }, [selected, grid, notesGrid, won, paused, isGiven, pushHistory]);

  const useHint = useCallback(() => {
    if (!selected || !grid || hintsLeft <= 0 || won || paused) return;
    const [r, c] = selected;
    if (isGiven(r, c) || grid[r][c] === solution[r][c]) return;
    pushHistory(grid, notesGrid);
    const newGrid = cloneGrid(grid);
    newGrid[r][c] = solution[r][c];
    const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
    newNotes[r][c] = new Set();
    for (const [pr, pc] of peers(r, c)) newNotes[pr][pc].delete(solution[r][c]);
    setGrid(newGrid);
    setNotesGrid(newNotes);
    setHintsLeft((h) => h - 1);

    if (boardIsComplete(newGrid)) {
      const allCorrect = newGrid.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]));
      if (allCorrect) setWon(true);
    }
  }, [selected, grid, notesGrid, hintsLeft, won, paused, isGiven, solution, pushHistory]);

  // keyboard support
  useEffect(() => {
    function onKey(e) {
      if (screen !== "game" || won) return;
      if (e.key >= "1" && e.key <= "9") placeNumber(parseInt(e.key, 10));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") clearCell();
      else if (e.key === "ArrowUp" && selected) setSelected([(selected[0] + 8) % 9, selected[1]]);
      else if (e.key === "ArrowDown" && selected) setSelected([(selected[0] + 1) % 9, selected[1]]);
      else if (e.key === "ArrowLeft" && selected) setSelected([selected[0], (selected[1] + 8) % 9]);
      else if (e.key === "ArrowRight" && selected) setSelected([selected[0], (selected[1] + 1) % 9]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, won, selected, placeNumber, clearCell]);

  const selectedValue = selected && grid ? grid[selected[0]][selected[1]] : 0;

  const cellState = useCallback(
    (r, c) => {
      const isSelected = selected && selected[0] === r && selected[1] === c;
      const value = grid ? grid[r][c] : 0;
      const isError = autoCheck && value !== 0 && solution && value !== solution[r][c];
      const isFlash = flashError && flashError[0] === r && flashError[1] === c;

      // A digit armed on the number pad takes over highlighting: show every
      // cell holding that digit, and drop the row/col/box shading so the
      // digit's own placements read clearly (Microsoft Sudoku-style).
      if (selectedDigit) {
        const sameNumber = value === selectedDigit;
        return { inSelectedUnit: false, isSelected, sameNumber, isError, isFlash };
      }

      const inSelectedUnit =
        selected &&
        (selected[0] === r ||
          selected[1] === c ||
          (Math.floor(selected[0] / 3) === Math.floor(r / 3) && Math.floor(selected[1] / 3) === Math.floor(c / 3)));
      const sameNumber = selectedValue !== 0 && value === selectedValue;
      return { inSelectedUnit, isSelected, sameNumber, isError, isFlash };
    },
    [selected, grid, selectedValue, selectedDigit, autoCheck, solution, flashError]
  );

  if (screen === "menu") {
    return (
      <MenuScreen
        T={T}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        fontScale={fontScale}
        onStart={startGame}
        loading={loading}
        statsRef={statsRef}
        onStats={() => setScreen("stats")}
        onSettings={() => {
          prevScreenRef.current = "menu";
          setScreen("settings");
        }}
      />
    );
  }

  if (screen === "stats") {
    return <StatsScreen T={T} fontScale={fontScale} statsRef={statsRef} onBack={() => setScreen("menu")} />;
  }

  if (screen === "settings") {
    return (
      <SettingsScreen
        T={T}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        fontScale={fontScale}
        prefs={prefs}
        setPrefs={setPrefs}
        onBack={() => setScreen(prevScreenRef.current)}
      />
    );
  }

  return (
    <GameScreen
      T={T}
      themeMode={themeMode}
      setThemeMode={setThemeMode}
      fontScale={fontScale}
      grid={grid}
      notesGrid={notesGrid}
      selected={selected}
      setSelected={setSelected}
      selectedDigit={selectedDigit}
      toggleSelectedDigit={toggleSelectedDigit}
      handleCellClick={handleCellClick}
      handleCellRightClick={handleCellRightClick}
      mode={mode}
      setMode={setMode}
      mistakes={mistakes}
      hintsLeft={hintsLeft}
      seconds={seconds}
      paused={paused}
      setPaused={setPaused}
      won={won}
      autoCheck={autoCheck}
      setAutoCheck={setAutoCheck}
      cellState={cellState}
      isGiven={isGiven}
      placeNumber={placeNumber}
      clearCell={clearCell}
      useHint={useHint}
      handleUndo={handleUndo}
      canUndo={history.length > 0}
      difficulty={actualDifficulty || difficulty}
      onMenu={() => setScreen("menu")}
      onNewGame={() => startGame(difficulty)}
      onSettings={() => {
        prevScreenRef.current = "game";
        setScreen("settings");
      }}
      notesGridData={notesGrid}
    />
  );
}

/* ============================================================
   MENU SCREEN
   ============================================================ */

function MenuScreen({ T, themeMode, setThemeMode, fontScale = 1, onStart, loading, statsRef, onStats, onSettings }) {
  const [hoverDiff, setHoverDiff] = useState(null);
  const stats = statsRef.current;
  const fs = (px) => Math.round(px * fontScale);

  return (
    <div
      style={{
        minHeight: "100%",
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "32px 20px 40px",
        position: "relative",
        transition: "background 0.3s, color 0.3s",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        button:focus-visible, .cell:focus-visible { outline: 2px solid ${T.accent}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      <div style={{ position: "absolute", top: 20, right: 20, display: "flex", gap: 8 }}>
        <button
          onClick={onSettings}
          aria-label="Settings"
          style={{
            background: "transparent",
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            width: Math.round(34 * fontScale),
            height: Math.round(34 * fontScale),
            color: T.textMuted,
            fontSize: fs(15),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ⚙
        </button>
        <button
          onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")}
          style={{
            background: "transparent",
            border: `1px solid ${T.border}`,
            borderRadius: 20,
            padding: "6px 14px",
            color: T.textMuted,
            fontSize: fs(13),
          }}
        >
          {themeMode === "light" ? "Dark" : "Light"}
        </button>
      </div>


      <div style={{ marginTop: 28, textAlign: "center" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: fs(13),
            letterSpacing: "0.18em",
            color: T.accent,
            fontWeight: 600,
            marginBottom: 10,
          }}
        >
          NINE BY NINE
        </div>
        <h1 style={{ fontSize: fs(40), fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>Ledger Sudoku</h1>
        <p style={{ color: T.textMuted, fontSize: fs(15), marginTop: 8, maxWidth: 360 }}>
          A quiet board, an honest pencil, no ads. Pick a difficulty and begin.
        </p>
      </div>

      {/* Mini board illustration */}
      <div style={{ margin: "28px 0 8px" }}>
        <MiniBoardArt T={T} />
      </div>

      <div style={{ width: "100%", maxWidth: 380, marginTop: 20 }}>
        {DIFFICULTIES.map((d) => {
          const best = stats.bestTimes[d];
          return (
            <button
              key={d}
              onMouseEnter={() => setHoverDiff(d)}
              onMouseLeave={() => setHoverDiff(null)}
              onClick={() => onStart(d)}
              disabled={loading}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: hoverDiff === d ? T.accentSoft : T.paper,
                border: `1px solid ${hoverDiff === d ? T.accent : T.border}`,
                borderRadius: 10,
                padding: "14px 18px",
                marginBottom: 10,
                color: T.text,
                transition: "background 0.15s, border-color 0.15s",
              }}
            >
              <span style={{ fontWeight: 600, fontSize: fs(16) }}>{d}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: fs(13), color: T.textMuted }}>
                {best !== undefined ? `best ${formatTime(best)}` : "—"}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={onStats}
        style={{
          marginTop: 18,
          background: "transparent",
          border: "none",
          color: T.accent,
          fontSize: fs(14),
          fontWeight: 600,
          textDecoration: "underline",
          textDecorationColor: T.accentSoft,
        }}
      >
        View statistics
      </button>

      {loading && (
        <div style={{ marginTop: 18, color: T.textMuted, fontSize: fs(13) }}>Drawing a fresh grid…</div>
      )}
    </div>
  );
}

function MiniBoardArt({ T }) {
  // a small decorative 9x9 grid with a few filled numbers, purely visual
  const sample = [
    [5, 3, 0, 0, 7, 0, 0, 0, 0],
    [6, 0, 0, 1, 9, 5, 0, 0, 0],
    [0, 9, 8, 0, 0, 0, 0, 6, 0],
    [8, 0, 0, 0, 6, 0, 0, 0, 3],
    [4, 0, 0, 8, 0, 3, 0, 0, 1],
    [7, 0, 0, 0, 2, 0, 0, 0, 6],
    [0, 6, 0, 0, 0, 0, 2, 8, 0],
    [0, 0, 0, 4, 1, 9, 0, 0, 5],
    [0, 0, 0, 0, 8, 0, 0, 7, 9],
  ];
  const cell = 18;
  return (
    <svg width={cell * 9 + 2} height={cell * 9 + 2} viewBox={`0 0 ${cell * 9 + 2} ${cell * 9 + 2}`}>
      <rect x="0" y="0" width={cell * 9 + 2} height={cell * 9 + 2} fill={T.paper} rx="6" />
      {Array.from({ length: 10 }).map((_, i) => (
        <line
          key={`h${i}`}
          x1={1}
          y1={1 + i * cell}
          x2={1 + cell * 9}
          y2={1 + i * cell}
          stroke={i % 3 === 0 ? T.boxBorder : T.border}
          strokeWidth={i % 3 === 0 ? 1.6 : 0.6}
        />
      ))}
      {Array.from({ length: 10 }).map((_, i) => (
        <line
          key={`v${i}`}
          x1={1 + i * cell}
          y1={1}
          x2={1 + i * cell}
          y2={1 + cell * 9}
          stroke={i % 3 === 0 ? T.boxBorder : T.border}
          strokeWidth={i % 3 === 0 ? 1.6 : 0.6}
        />
      ))}
      {sample.map((row, r) =>
        row.map((v, c) =>
          v ? (
            <text
              key={`${r}-${c}`}
              x={1 + c * cell + cell / 2}
              y={1 + r * cell + cell / 2 + 4}
              textAnchor="middle"
              fontSize="11"
              fontFamily="'JetBrains Mono', monospace"
              fill={T.textMuted}
            >
              {v}
            </text>
          ) : null
        )
      )}
    </svg>
  );
}

/* ============================================================
   STATS SCREEN
   ============================================================ */

function StatsScreen({ T, fontScale = 1, statsRef, onBack }) {
  const stats = statsRef.current;
  const winRate = stats.gamesPlayed ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100) : 0;
  const fs = (px) => Math.round(px * fontScale);

  return (
    <div
      style={{
        minHeight: "100%",
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "32px 20px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: T.accent, fontSize: fs(14), fontWeight: 600, marginBottom: 18, padding: 0 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: fs(26), fontWeight: 700, marginBottom: 18 }}>Statistics</h2>

        <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
          <StatCard T={T} fontScale={fontScale} label="Played" value={stats.gamesPlayed} />
          <StatCard T={T} fontScale={fontScale} label="Win rate" value={`${winRate}%`} />
          <StatCard T={T} fontScale={fontScale} label="Streak" value={stats.currentStreak} accent />
        </div>

        <div style={{ fontSize: fs(13), color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
          BEST TIMES
        </div>
        {DIFFICULTIES.map((d) => (
          <div
            key={d}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: T.paper,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              marginBottom: 6,
              fontSize: fs(14),
            }}
          >
            <span>{d}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: T.textMuted }}>
              {stats.bestTimes[d] !== undefined ? formatTime(stats.bestTimes[d]) : "—"} · {stats.completions[d] || 0} won
            </span>
          </div>
        ))}

        <div style={{ marginTop: 18, fontSize: fs(12), color: T.textMuted }}>
          Best streak: {stats.bestStreak}
        </div>
      </div>
    </div>
  );
}

function StatCard({ T, fontScale = 1, label, value, accent }) {
  const fs = (px) => Math.round(px * fontScale);
  return (
    <div
      style={{
        flex: 1,
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "14px 12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: fs(22), fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: accent ? T.amber : T.text }}>
        {value}
      </div>
      <div style={{ fontSize: fs(11), color: T.textMuted, marginTop: 2, letterSpacing: "0.04em" }}>{label.toUpperCase()}</div>
    </div>
  );
}

/* ============================================================
   SETTINGS SCREEN
   ============================================================ */

function SettingsScreen({ T, themeMode, setThemeMode, fontScale = 1, prefs, setPrefs, onBack }) {
  const fs = (px) => Math.round(px * fontScale);
  return (
    <div
      style={{
        minHeight: "100%",
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: "32px 20px 40px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        transition: "background 0.3s, color 0.3s",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420 }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: T.accent, fontSize: fs(14), fontWeight: 600, marginBottom: 18, padding: 0 }}
        >
          ← Back
        </button>
        <h2 style={{ fontSize: fs(26), fontWeight: 700, marginBottom: 22 }}>Settings</h2>

        {/* Appearance mode */}
        <div style={{ fontSize: fs(13), color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
          APPEARANCE
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
          {["light", "dark"].map((m) => (
            <button
              key={m}
              onClick={() => setThemeMode(m)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 8,
                border: `1px solid ${themeMode === m ? T.accent : T.border}`,
                background: themeMode === m ? T.accentSoft : T.paper,
                color: themeMode === m ? T.accent : T.text,
                fontWeight: 600,
                fontSize: fs(14),
              }}
            >
              {m === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        {/* Accent color */}
        <div style={{ fontSize: fs(13), color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
          ACCENT COLOR
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
          {Object.entries(ACCENT_PRESETS).map(([key, preset]) => {
            const active = prefs.accent === key;
            return (
              <button
                key={key}
                onClick={() => setPrefs((p) => ({ ...p, accent: key }))}
                aria-label={preset.label}
                title={preset.label}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  padding: 4,
                  width: 64,
                }}
              >
                <span
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: preset.swatch,
                    border: active ? `3px solid ${T.text}` : `1px solid ${T.border}`,
                    boxSizing: "border-box",
                    display: "block",
                  }}
                />
                <span style={{ fontSize: fs(11), color: active ? T.text : T.textMuted, fontWeight: active ? 600 : 500, textAlign: "center" }}>
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Font / cell size */}
        <div style={{ fontSize: fs(13), color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
          TEXT & CELL SIZE
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
          {Object.entries(FONT_SCALES).map(([key, scale]) => {
            const active = prefs.fontScale === key;
            return (
              <button
                key={key}
                onClick={() => setPrefs((p) => ({ ...p, fontScale: key }))}
                style={{
                  flex: 1,
                  padding: "10px 4px",
                  borderRadius: 8,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : T.paper,
                  color: active ? T.accent : T.text,
                  fontWeight: 600,
                  fontSize: fs(13),
                }}
              >
                {scale.label}
              </button>
            );
          })}
        </div>

        {/* Live preview */}
        <div style={{ fontSize: fs(13), color: T.textMuted, marginBottom: 8, fontWeight: 600, letterSpacing: "0.04em" }}>
          PREVIEW
        </div>
        <div
          style={{
            background: T.paper,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {[3, 7, 0].map((n, i) => (
            <div
              key={i}
              style={{
                width: Math.round(40 * (FONT_SCALES[prefs.fontScale]?.multiplier || 1)),
                height: Math.round(40 * (FONT_SCALES[prefs.fontScale]?.multiplier || 1)),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: n === 7 ? T.accentSoft : T.related,
                border: `1px solid ${T.boxBorder}`,
                borderRadius: 4,
              }}
            >
              {n !== 0 && (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: Math.round(19 * (FONT_SCALES[prefs.fontScale]?.multiplier || 1)),
                    fontWeight: 600,
                    color: T.userNum,
                  }}
                >
                  {n}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   GAME SCREEN
   ============================================================ */

function GameScreen(props) {
  const {
    T, themeMode, setThemeMode, fontScale = 1,
    grid, notesGrid, selected, setSelected,
    selectedDigit, toggleSelectedDigit, handleCellClick, handleCellRightClick,
    mode, setMode, mistakes, hintsLeft, seconds, paused, setPaused, won,
    autoCheck, setAutoCheck, cellState, isGiven,
    placeNumber, clearCell, useHint, handleUndo, canUndo,
    difficulty, onMenu, onNewGame, onSettings,
  } = props;

  const fs = (px) => Math.round(px * fontScale);
  const boardWidth = Math.max(420, Math.round(BOARD_BASE_CELL * fontScale) * 9 + BOARD_CHROME);

  const numberCounts = useMemo(() => {
    const counts = Array(10).fill(0);
    if (!grid) return counts;
    grid.forEach((row) => row.forEach((v) => { if (v) counts[v]++; }));
    return counts;
  }, [grid]);

  if (!grid) return null;

  return (
    <div
      onClick={() => setSelected(null)}
      style={{
        minHeight: "100%",
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter', system-ui, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "20px 16px 32px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        .cell { cursor: pointer; user-select: none; }
        .numbtn:hover { background: ${T.accentSoft} !important; }
        .iconbtn:hover { background: ${T.ledger}; }
        .iconbtn:disabled { opacity: 0.35; cursor: default; }
        @keyframes flashred { 0%, 100% { background: inherit; } 50% { background: ${T.errorSoft}; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* Top bar */}
      <div style={{ width: "100%", maxWidth: boardWidth, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={onMenu} className="iconbtn" style={{ background: "transparent", border: "none", color: T.textMuted, fontSize: fs(14), padding: "6px 8px", borderRadius: 6 }}>
          ← Menu
        </button>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: fs(13), color: T.accent, fontWeight: 600, letterSpacing: "0.05em" }}>
          {difficulty?.toUpperCase()}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={onSettings} className="iconbtn" aria-label="Settings" style={{ background: "transparent", border: "none", color: T.textMuted, fontSize: fs(14), padding: "6px 8px", borderRadius: 6 }}>
            ⚙
          </button>
          <button onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")} className="iconbtn" style={{ background: "transparent", border: "none", color: T.textMuted, fontSize: fs(14), padding: "6px 8px", borderRadius: 6 }}>
            {themeMode === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {/* Status row */}
      <div
        style={{
          width: "100%",
          maxWidth: boardWidth,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
          padding: "10px 16px",
          background: T.paper,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: T.amber, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: fs(16) }}>
            {formatTime(seconds)}
          </span>
        </div>
        <div style={{ fontSize: fs(13), color: mistakes > 0 ? T.error : T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}>
          Mistakes: {mistakes}
        </div>
        <button
          onClick={() => setPaused((p) => !p)}
          className="iconbtn"
          style={{ background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 10px", fontSize: fs(13), color: T.text }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* Board */}
      <div style={{ position: "relative" }}>
        {paused && !won && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: themeMode === "light" ? "rgba(247,246,243,0.92)" : "rgba(21,20,15,0.92)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ fontSize: fs(18), fontWeight: 600 }}>Paused</div>
            <button
              onClick={() => setPaused(false)}
              style={{ background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 600, fontSize: fs(14) }}
            >
              Resume
            </button>
          </div>
        )}
        {won && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: themeMode === "light" ? "rgba(247,246,243,0.96)" : "rgba(21,20,15,0.96)",
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 5,
              flexDirection: "column",
              gap: 10,
              textAlign: "center",
              padding: 20,
            }}
          >
            <div style={{ fontSize: fs(24), fontWeight: 700, color: T.accent }}>Solved</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: fs(18) }}>{formatTime(seconds)}</div>
            <div style={{ fontSize: fs(13), color: T.textMuted }}>{mistakes} mistake{mistakes === 1 ? "" : "s"} · {difficulty}</div>
            <button
              onClick={onNewGame}
              style={{ marginTop: 8, background: T.accent, color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 600, fontSize: fs(14) }}
            >
              New puzzle
            </button>
          </div>
        )}

        <Board
          T={T}
          grid={grid}
          notesGrid={notesGrid}
          onCellClick={handleCellClick}
          onCellRightClick={handleCellRightClick}
          cellState={cellState}
          isGiven={isGiven}
          themeMode={themeMode}
          fontScale={fontScale}
        />
      </div>

      {/* Tool tray */}
      <div style={{ width: "100%", maxWidth: boardWidth, display: "flex", justifyContent: "space-around", marginTop: 16 }}>
        <ToolButton T={T} fontScale={fontScale} label="Undo" onClick={handleUndo} disabled={!canUndo} icon="↺" />
        <ToolButton
          T={T}
          fontScale={fontScale}
          label={mode === "notes" ? "Notes ✓" : "Notes"}
          title="Toggles note vs. answer for keyboard number keys (1-9). Mouse: pick a number on the pad, then left-click a cell for an answer or right-click for a note."
          onClick={() => setMode((m) => (m === "notes" ? "normal" : "notes"))}
          active={mode === "notes"}
          icon="✎"
        />
        <ToolButton T={T} fontScale={fontScale} label="Erase" onClick={clearCell} disabled={!selected || isGiven(selected[0], selected[1])} icon="⌫" />
        <ToolButton T={T} fontScale={fontScale} label={`Hint (${hintsLeft})`} onClick={useHint} disabled={hintsLeft <= 0 || !selected} icon="✺" />
      </div>

      {/* Number pad */}
      <div style={{ width: "100%", maxWidth: boardWidth, display: "grid", gridTemplateColumns: "repeat(9, 1fr)", gap: 6, marginTop: 14 }}>
        {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
          const remaining = 9 - numberCounts[n];
          const armed = selectedDigit === n;
          return (
            <button
              key={n}
              className="numbtn"
              disabled={remaining <= 0}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelectedDigit(n);
              }}
              style={{
                position: "relative",
                background: armed ? T.accent : T.paper,
                border: `1px solid ${armed ? T.accent : T.border}`,
                borderRadius: 8,
                padding: `${Math.round(10 * fontScale)}px 0`,
                fontSize: Math.round(18 * fontScale),
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 700,
                color: armed ? "#fff" : remaining <= 0 ? T.textMuted : T.text,
                opacity: remaining <= 0 ? 0.3 : 1,
                transition: "background 0.12s, border-color 0.12s",
              }}
            >
              {n}
              {remaining > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    right: 4,
                    fontSize: fs(9),
                    fontWeight: 600,
                    color: armed ? "#fff" : T.textMuted,
                    opacity: armed ? 0.85 : 0.7,
                  }}
                >
                  {remaining}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Control hint */}
      <div style={{ fontSize: fs(12), color: T.textMuted, marginTop: 10, textAlign: "center" }}>
        Click a number, then left-click a cell for an answer · right-click for a note
      </div>

      {/* Auto-check toggle */}
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: fs(13), color: T.textMuted, cursor: "pointer" }}>
        <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
        Highlight mistakes as I go
      </label>
    </div>
  );
}

function ToolButton({ T, fontScale = 1, label, onClick, disabled, active, icon, title }) {
  const fs = (px) => Math.round(px * fontScale);
  return (
    <button
      className="iconbtn"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
        background: active ? T.accentSoft : "transparent",
        border: "none",
        borderRadius: 8,
        padding: "8px 10px",
        color: active ? T.accent : T.text,
        minWidth: 64,
      }}
    >
      <span style={{ fontSize: fs(18) }}>{icon}</span>
      <span style={{ fontSize: fs(11), fontWeight: 500 }}>{label}</span>
    </button>
  );
}

/* ============================================================
   BOARD + CELL
   ============================================================ */

function Board({ T, grid, notesGrid, onCellClick, onCellRightClick, cellState, isGiven, themeMode, fontScale = 1 }) {
  const cellSize = Math.round(BOARD_BASE_CELL * fontScale);
  const boardPx = cellSize * 9;
  const digitFontSize = Math.round(31 * fontScale);
  const noteFontSize = Math.max(9, Math.round(13 * fontScale));

  return (
    <div
      style={{
        background: T.paper,
        border: `3px solid ${T.boxBorder}`,
        borderRadius: 10,
        padding: 8,
        boxShadow: themeMode === "light" ? "0 1px 3px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.4)",
      }}
    >
      <div
        style={{
          position: "relative",
          width: boardPx,
          height: boardPx,
          backgroundImage: `repeating-linear-gradient(${T.ledger} 0 1px, transparent 1px ${cellSize}px)`,
        }}
      >
        {/* cells */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(9, ${cellSize}px)`, gridTemplateRows: `repeat(9, ${cellSize}px)` }}>
          {grid.map((row, r) =>
            row.map((val, c) => {
              const state = cellState(r, c);
              const given = isGiven(r, c);
              const notes = notesGrid[r][c];
              let bg = T.paper;
              if (state.isFlash) bg = T.errorSoft;
              else if (state.isSelected) bg = T.accentSoft;
              else if (state.sameNumber) bg = T.sameNum;
              else if (state.inSelectedUnit) bg = T.related;

              return (
                <div
                  key={`${r}-${c}`}
                  className="cell"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCellClick(r, c);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onCellRightClick(r, c);
                  }}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: bg,
                    borderTop: r % 3 === 0 ? `3px solid ${T.boxBorder}` : `1px solid ${T.border}`,
                    borderLeft: c % 3 === 0 ? `3px solid ${T.boxBorder}` : `1px solid ${T.border}`,
                    borderRight: c === 8 ? `3px solid ${T.boxBorder}` : "none",
                    borderBottom: r === 8 ? `3px solid ${T.boxBorder}` : "none",
                    transition: "background 0.15s",
                    position: "relative",
                  }}
                >
                  {val !== 0 ? (
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: digitFontSize,
                        fontWeight: given ? 800 : 600,
                        color: state.isError ? T.error : given ? T.given : T.userNum,
                      }}
                    >
                      {val}
                    </span>
                  ) : notes.size > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        width: "100%",
                        height: "100%",
                        padding: 2,
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span
                          key={n}
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: noteFontSize,
                            color: T.note,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: notes.has(n) ? 1 : 0,
                          }}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default SudokuApp;
