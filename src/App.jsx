import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { cloneGrid, peers, generatePuzzle, boardIsComplete } from "./lib/sudoku.js";
import { digitPadState } from "./lib/pad.js";
import { recordStart, recordWin, recordAbandon, loadStats, saveStats } from "./stats.js";

/* ============================================================
   PERSISTENCE
   ============================================================ */

const STORAGE_KEY_STATS = "sudoku_stats_v1";
const STORAGE_KEY_SETTINGS = "sudoku_settings_v1";

// True when the device's PRIMARY pointer is a finger. Note this is a question
// about input hardware, not about screen size -- a 1024px tablet is coarse, a
// 500px-wide desktop window is not. Touch and mouse afford different things
// (there is no right-click and no hover on a finger), so the interaction model
// branches on this, while the *layout* branches on width. Two questions, two
// media features.
function useCoarsePointer() {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(query).matches
  );

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const onChange = (e) => setCoarse(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return coarse;
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

// localStorage can be missing or throw (privacy modes, file:// quirks);
// loadStats/saveStats tolerate a null or throwing storage.
function browserStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
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
  const coarsePointer = useCoarsePointer();

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

  // Stats persist like settings. Loading also turns a game that was still in
  // progress when the app last closed into an abandon (see src/stats.js).
  const [stats, setStats] = useState(() => loadStats(browserStorage(), STORAGE_KEY_STATS));

  useEffect(() => {
    saveStats(browserStorage(), stats, STORAGE_KEY_STATS);
  }, [stats]);

  const timerRef = useRef(null);

  useEffect(() => {
    if (screen === "game" && !paused && !won) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      return () => clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [screen, paused, won]);

  const startGame = useCallback((diff) => {
    setStats(recordAbandon); // no-op unless the current game was started and not won
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

  // `fromHint` marks the step a hint made, so undoing it gives the hint back.
  const pushHistory = useCallback((g, n, fromHint = false) => {
    setHistory((h) => [...h, { grid: cloneGrid(g), notes: n.map((row) => row.map((s) => new Set(s))), fromHint }]);
  }, []);

  // Reads history from the closure instead of a setHistory updater: updaters
  // must stay pure (StrictMode runs them twice), and this one now also
  // refunds a hint.
  const handleUndo = useCallback(() => {
    // A solved board is final, and a paused one is hidden.
    if (won || paused || history.length === 0) return;
    const last = history[history.length - 1];
    setGrid(last.grid);
    setNotesGrid(last.notes);
    if (last.fromHint) setHintsLeft((h) => h + 1);
    setHistory(history.slice(0, -1));
  }, [history, won, paused]);

  const isGiven = useCallback((r, c) => puzzle && puzzle[r][c] !== 0, [puzzle]);

  // Shared by every path that can put the last correct digit on the board
  // (a placed answer or a hint), so a win is always recorded the same way.
  const finishIfSolved = useCallback(
    (newGrid) => {
      if (!boardIsComplete(newGrid)) return;
      const allCorrect = newGrid.every((row, ri) => row.every((v, ci) => v === solution[ri][ci]));
      if (!allCorrect) return;
      setWon(true);
      const diffKey = actualDifficulty || difficulty;
      setStats((s) => recordWin(s, { difficulty: diffKey, seconds }));
    },
    [solution, actualDifficulty, difficulty, seconds]
  );

  // Core placement logic, independent of how the cell/number were chosen.
  // Used by both keyboard entry (selected cell + mode) and mouse entry
  // (clicked cell + left/right click).
  const placeNumberAt = useCallback(
    (r, c, n, asNote) => {
      if (!grid || won || paused) return false;
      if (isGiven(r, c)) return false;

      if (asNote) {
        // A cell that holds a value takes no notes: they'd be hidden under
        // the digit and resurface when it's erased.
        if (grid[r][c] !== 0) return false;
        const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
        pushHistory(grid, notesGrid);
        if (newNotes[r][c].has(n)) newNotes[r][c].delete(n);
        else newNotes[r][c].add(n);
        setNotesGrid(newNotes);
        return true;
      }

      // Same digit already there: nothing changes, so no undo step and no
      // extra mistake for re-clicking a wrong answer.
      if (grid[r][c] === n) return true;

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
      setStats(recordStart); // first answer on the board makes the game "played"
      finishIfSolved(newGrid);
      return true;
    },
    [grid, notesGrid, won, paused, isGiven, solution, autoCheck, pushHistory, finishIfSolved]
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
  //
  // On touch there is a second, cell-first flow (the one every mobile Sudoku
  // uses): tap a cell to select it, then tap digits to fill it. Without this,
  // a pad tap could only ever *arm* a digit, so the only way to enter anything
  // with a finger was arm-then-tap-cell -- which hardcoded `false` for notes,
  // making pencil marks literally unreachable on a phone.
  const onPadDigit = useCallback(
    (n) => {
      if (coarsePointer && selected && !isGiven(selected[0], selected[1])) {
        placeNumberAt(selected[0], selected[1], n, mode === "notes");
        return; // keep the selection: tapping another digit corrects or adds another note
      }
      setSelectedDigit((d) => (d === n ? null : n));
    },
    [coarsePointer, selected, isGiven, mode, placeNumberAt]
  );

  const handleCellClick = useCallback(
    (r, c) => {
      if (selectedDigit) {
        // An armed digit only fills empty cells. Clicking a filled one just
        // selects it, so a stray click can't overwrite an answer. To correct
        // an entry, select the cell and type (or, on touch, tap a digit).
        if (grid[r][c] !== 0) {
          setSelected([r, c]);
          return;
        }
        // A finger has no right-click, so on touch the Notes toggle has to
        // govern the tap path. On a mouse the historical contract is preserved
        // exactly: left-click always answers, right-click always notes.
        const asNote = coarsePointer && mode === "notes";
        const placed = placeNumberAt(r, c, selectedDigit, asNote);
        setSelected(placed ? null : [r, c]);
      } else {
        setSelected([r, c]);
      }
    },
    [selectedDigit, grid, placeNumberAt, coarsePointer, mode]
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
    // Erase the answer if there is one, otherwise the cell's pencil notes.
    // An empty cell with no notes is left alone, with no undo step recorded.
    if (grid[r][c] !== 0) {
      pushHistory(grid, notesGrid);
      const newGrid = cloneGrid(grid);
      newGrid[r][c] = 0;
      setGrid(newGrid);
    } else if (notesGrid[r][c].size > 0) {
      pushHistory(grid, notesGrid);
      const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
      newNotes[r][c] = new Set();
      setNotesGrid(newNotes);
    }
  }, [selected, grid, notesGrid, won, paused, isGiven, pushHistory]);

  const useHint = useCallback(() => {
    if (!selected || !grid || hintsLeft <= 0 || won || paused) return;
    const [r, c] = selected;
    if (isGiven(r, c) || grid[r][c] === solution[r][c]) return;
    pushHistory(grid, notesGrid, true);
    const newGrid = cloneGrid(grid);
    newGrid[r][c] = solution[r][c];
    const newNotes = notesGrid.map((row) => row.map((s) => new Set(s)));
    newNotes[r][c] = new Set();
    for (const [pr, pc] of peers(r, c)) newNotes[pr][pc].delete(solution[r][c]);
    setGrid(newGrid);
    setNotesGrid(newNotes);
    setHintsLeft((h) => h - 1);
    setStats(recordStart); // a hint is an answer too
    finishIfSolved(newGrid);
  }, [selected, grid, notesGrid, hintsLeft, won, paused, isGiven, solution, pushHistory, finishIfSolved]);

  // keyboard support
  useEffect(() => {
    function onKey(e) {
      if (screen !== "game") return;
      if (e.key === "Escape") {
        // Disarm the pad digit and drop the selection -- the keyboard way out
        // of number-first entry.
        setSelectedDigit(null);
        setSelected(null);
        return;
      }
      if (won || paused) return; // the board is hidden while paused
      if (e.key >= "1" && e.key <= "9") placeNumber(parseInt(e.key, 10));
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") clearCell();
      else if (e.key === "ArrowUp" && selected) setSelected([(selected[0] + 8) % 9, selected[1]]);
      else if (e.key === "ArrowDown" && selected) setSelected([(selected[0] + 1) % 9, selected[1]]);
      else if (e.key === "ArrowLeft" && selected) setSelected([selected[0], (selected[1] + 8) % 9]);
      else if (e.key === "ArrowRight" && selected) setSelected([selected[0], (selected[1] + 1) % 9]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, won, paused, selected, placeNumber, clearCell]);

  const selectedValue = selected && grid ? grid[selected[0]][selected[1]] : 0;

  // Remaining count + dimmed/disabled per pad digit (rules in src/lib/pad.js).
  const padState = useMemo(() => digitPadState(grid, solution, autoCheck), [grid, solution, autoCheck]);

  // A digit whose button just became disabled can't be clicked to disarm it,
  // so disarm it here; otherwise every cell click would keep placing it.
  useEffect(() => {
    if (selectedDigit && padState[selectedDigit].disabled) setSelectedDigit(null);
  }, [selectedDigit, padState]);

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
        stats={stats}
        onStats={() => setScreen("stats")}
        onSettings={() => {
          prevScreenRef.current = "menu";
          setScreen("settings");
        }}
      />
    );
  }

  if (screen === "stats") {
    return <StatsScreen T={T} fontScale={fontScale} stats={stats} onBack={() => setScreen("menu")} />;
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
      onPadDigit={onPadDigit}
      coarsePointer={coarsePointer}
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
      padState={padState}
      isGiven={isGiven}
      placeNumber={placeNumber}
      clearCell={clearCell}
      useHint={useHint}
      handleUndo={handleUndo}
      canUndo={!won && !paused && history.length > 0}
      difficulty={actualDifficulty || difficulty}
      onMenu={() => {
        // There is no way back into this game from the menu, so leaving
        // a started, unfinished game here abandons it.
        setStats(recordAbandon);
        setScreen("menu");
      }}
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

function MenuScreen({ T, themeMode, setThemeMode, fontScale = 1, onStart, loading, stats, onStats, onSettings }) {
  const [hoverDiff, setHoverDiff] = useState(null);
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

function StatsScreen({ T, fontScale = 1, stats, onBack }) {
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
    selectedDigit, onPadDigit, coarsePointer, handleCellClick, handleCellRightClick,
    mode, setMode, mistakes, hintsLeft, seconds, paused, setPaused, won,
    autoCheck, setAutoCheck, cellState, padState, isGiven,
    placeNumber, clearCell, useHint, handleUndo, canUndo,
    difficulty, onMenu, onNewGame, onSettings,
  } = props;

  const fs = (px) => Math.round(px * fontScale);

  // These are the *ideal* sizes -- exactly the integers the previous code
  // computed. They are handed to CSS as custom properties rather than applied
  // as inline pixel values, because an inline value cannot be narrowed by a
  // media query. The stylesheet passes them through untouched on desktop and
  // clamps them with min() on a phone. See the header comment in index.css.
  //
  // NB: BOARD_CHROME is 18 here but the board's real chrome is 22px (8px
  // padding x2 + 3px border x2), so the control rows sit 4px narrower than the
  // board. That is a pre-existing desktop quirk and it is preserved on purpose
  // -- fixing it would change the PC layout. It is a one-line fix when you want it.
  const rowWidthIdeal = Math.max(420, Math.round(BOARD_BASE_CELL * fontScale) * 9 + BOARD_CHROME);

  if (!grid) return null;

  const eraseDisabled = !selected || isGiven(selected[0], selected[1]);

  return (
    <div
      className="lsg"
      onClick={() => setSelected(null)}
      style={{
        background: T.bg,
        color: T.text,
        fontFamily: "'Inter', system-ui, sans-serif",

        "--cell-ideal": `${Math.round(BOARD_BASE_CELL * fontScale)}px`,
        "--digit-fs-ideal": `${fs(31)}px`,
        "--note-fs-ideal": `${Math.max(9, fs(13))}px`,
        "--row-w-ideal": `${rowWidthIdeal}px`,
        "--pad-btn-py-ideal": `${fs(10)}px`,
        "--pad-fs-ideal": `${fs(18)}px`,
        "--badge-fs-ideal": `${fs(9)}px`,
        "--hint-fs-ideal": `${fs(12)}px`,
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        .cell { cursor: pointer; user-select: none; }
        .iconbtn:disabled { opacity: 0.35; cursor: default; }
        .numbtn:disabled { cursor: default; }
        /* Hover styles are gated on the device actually HAVING hover. Without
           this, mobile browsers emulate :hover on tap and the style sticks to
           the last button you touched until you tap somewhere else. */
        @media (hover: hover) {
          .numbtn:not(:disabled):hover { background: ${T.accentSoft} !important; }
          .iconbtn:not(:disabled):hover { background: ${T.ledger}; }
        }
        @media (hover: none) {
          .numbtn:not(:disabled):active { transform: scale(0.94); }
          .iconbtn:not(:disabled):active { background: ${T.ledger}; }
        }
        @keyframes flashred { 0%, 100% { background: inherit; } 50% { background: ${T.errorSoft}; } }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
      `}</style>

      {/* Top bar */}
      <div className="lsg-row lsg-topbar">
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
          <button onClick={() => setThemeMode(themeMode === "light" ? "dark" : "light")} className="iconbtn" aria-label="Toggle theme" style={{ background: "transparent", border: "none", color: T.textMuted, fontSize: fs(14), padding: "6px 8px", borderRadius: 6 }}>
            {themeMode === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </div>

      {/* Status row */}
      <div
        className="lsg-row lsg-status"
        style={{
          background: T.paper,
          border: `1px solid ${T.border}`,
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

      {/* Board. The wrapper is the flex/grid cell that owns the leftover space;
          the stage is what the board and its overlays actually sit in. */}
      <div className="lsg-boardwrap">
        <div className="lsg-boardstage">
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
          />
        </div>
      </div>

      {/* Everything below the board. Grouped so the landscape layout can move
          it into a right-hand column with a single grid-area, without
          reordering the DOM (which would wreck the tab order). */}
      <div className="lsg-controls">
        {/* Tool tray. On touch we stop the click bubbling to the root's
            "deselect" handler -- otherwise tapping Notes would immediately
            clear the cell you were about to annotate. On a mouse the click
            still bubbles, exactly as before. */}
        <div
          className="lsg-row lsg-tools"
          onClick={(e) => { if (coarsePointer) e.stopPropagation(); }}
        >
          <ToolButton T={T} fontScale={fontScale} label="Undo" onClick={handleUndo} disabled={!canUndo} icon="↺" />
          <ToolButton
            T={T}
            fontScale={fontScale}
            label={mode === "notes" ? "Notes ✓" : "Notes"}
            title="Toggles note vs. answer. Touch: tap ✎, then tap digits to pencil them in. Mouse: pick a number on the pad, then left-click a cell for an answer or right-click for a note."
            onClick={() => setMode((m) => (m === "notes" ? "normal" : "notes"))}
            active={mode === "notes"}
            icon="✎"
          />
          <ToolButton className="lsg-tool-erase" T={T} fontScale={fontScale} label="Erase" onClick={clearCell} disabled={eraseDisabled} icon="⌫" />
          <ToolButton T={T} fontScale={fontScale} label={`Hint (${hintsLeft})`} onClick={useHint} disabled={hintsLeft <= 0 || !selected} icon="✺" />
        </div>

        {/* Number pad. 9 across on desktop; 5x2 on a phone, where 9 across
            would give ~33px targets. The 10th slot becomes Erase. */}
        <div className="lsg-row lsg-pad">
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => {
            const { remaining, dimmed, disabled } = padState[n];
            const armed = selectedDigit === n;
            return (
              <button
                key={n}
                className="numbtn"
                disabled={disabled}
                aria-label={`Digit ${n}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPadDigit(n);
                }}
                style={{
                  background: armed ? T.accent : T.paper,
                  border: `1px solid ${armed ? T.accent : T.border}`,
                  color: armed ? "#fff" : dimmed ? T.textMuted : T.text,
                  opacity: dimmed && !armed ? 0.3 : 1,
                }}
              >
                {n}
                {remaining > 0 && (
                  <span
                    className="numbtn-badge"
                    style={{
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

          <button
            className="numbtn lsg-pad-erase"
            disabled={eraseDisabled}
            aria-label="Erase"
            onClick={(e) => {
              e.stopPropagation();
              clearCell();
            }}
            style={{
              background: T.paper,
              border: `1px solid ${T.border}`,
              color: T.text,
              opacity: eraseDisabled ? 0.3 : 1,
            }}
          >
            ⌫
          </button>
        </div>

        {/* Control hint */}
        <div className="lsg-hint" style={{ color: T.textMuted }}>
          <span className="lsg-hint-fine">
            Click a number, then left-click a cell for an answer · right-click for a note
          </span>
          <span className="lsg-hint-coarse">
            Tap a cell, then a number · ✎ Notes for pencil marks
          </span>
        </div>

        {/* Auto-check toggle */}
        <label
          className="lsg-autocheck"
          style={{ fontSize: fs(13), color: T.textMuted }}
          onClick={(e) => { if (coarsePointer) e.stopPropagation(); }}
        >
          <input type="checkbox" checked={autoCheck} onChange={(e) => setAutoCheck(e.target.checked)} />
          Highlight mistakes as I go
        </label>
      </div>
    </div>
  );
}

function ToolButton({ T, fontScale = 1, label, onClick, disabled, active, icon, title, className = "" }) {
  const fs = (px) => Math.round(px * fontScale);
  return (
    <button
      className={`iconbtn toolbtn ${className}`.trim()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: active ? T.accentSoft : "transparent",
        color: active ? T.accent : T.text,
      }}
    >
      <span style={{ fontSize: fs(18) }}>{icon}</span>
      <span style={{ fontSize: fs(11), fontWeight: 500 }}>{label}</span>
    </button>
  );
}

/* ============================================================
   BOARD + CELL

   All geometry now comes from the single CSS custom property --cell, declared
   on .lsg-boardstage. The grid columns, the cell boxes, the digit size, the
   note size and the ruled-paper gradient all read the same length, so they
   cannot drift out of alignment -- which is precisely why the cells stay at an
   explicit width instead of the more obvious `1fr`: a fractional column has no
   value the background-gradient's repeat period could be tied to.
   ============================================================ */

function Board({ T, grid, notesGrid, onCellClick, onCellRightClick, cellState, isGiven, themeMode }) {
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
          width: "calc(var(--cell) * 9)",
          height: "calc(var(--cell) * 9)",
          backgroundImage: `repeating-linear-gradient(${T.ledger} 0 1px, transparent 1px var(--cell))`,
        }}
      >
        {/* cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(9, var(--cell))", gridTemplateRows: "repeat(9, var(--cell))" }}>
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
                    width: "var(--cell)",
                    height: "var(--cell)",
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
                        fontSize: "var(--digit-fs)",
                        fontWeight: given ? 800 : 600,
                        color: state.isError ? T.error : given ? T.given : T.userNum,
                      }}
                    >
                      {val}
                    </span>
                  ) : notes.size > 0 ? (
                    <div className="cell-notes">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <span
                          key={n}
                          style={{
                            fontFamily: "'JetBrains Mono', monospace",
                            fontSize: "var(--note-fs)",
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
