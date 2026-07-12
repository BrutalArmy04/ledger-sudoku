# Ledger Sudoku

A premium, ad-free Sudoku desktop app with a clean paper-and-pencil aesthetic.

## ▶ Play it in your browser: https://brutalarmy04.github.io/ledger-sudoku/

## ⬇️ Download

**[Download Ledger Sudoku for Windows](https://github.com/BrutalArmy04/ledger-sudoku/releases/latest)**

Grab the portable `Ledger Sudoku 1.0.0.exe` — no installation needed, just
double-click and play. Or use the `Setup` installer if you'd prefer a Start
Menu entry and desktop shortcut.

> First launch may show a Windows SmartScreen warning (the app isn't
> code-signed). Click **More info → Run anyway**.

---
A premium, ad-free Sudoku app — classic 9x9 puzzles with pencil notes, hints,
mistake tracking, undo, light/dark themes, and a real difficulty grader
(it checks which solving techniques a puzzle actually requires, not just
how many clues are missing).

## Play it in your browser (no install needed beyond Node.js)

```
npm install
npm run dev
```

Open the printed URL (usually `http://localhost:5173`).

## Play it as a desktop app, in a window (quick check)

```
npm run electron:dev
```

This opens the game in its own window immediately — good for confirming
everything works before building the full Windows installer below.

## Build a Windows .exe

```
npm run dist:win
```

This produces a `release` folder containing:

- **`Ledger Sudoku Setup 1.0.0.exe`** — a standard installer. Adds a Start
  Menu entry and desktop shortcut.
- **`Ledger Sudoku 1.0.0.exe`** — a portable, single-file version. No
  installation — just double-click it to play. This is probably what you
  want if you just want "an app I can double-click."

The first time you run `npm run dist:win`, it will download Electron's
Windows build tools — this can take a few minutes and needs an internet
connection, but only happens once.

## Building a standalone web version (no Electron)

```
npm run build
```

Creates a `dist/` folder you can open directly (`dist/index.html`) or serve
with any static file server.

## Notes

- Stats (best times, streaks) reset when you close the app — they're kept
  in memory only, not saved to disk. The `statsRef` object in `src/App.jsx`
  is where you'd wire up persistent storage if you want that later.
- All game logic (puzzle generator, solver, difficulty grader) lives in
  `src/App.jsx`, above the React components — plain JavaScript, no
  framework dependencies, portable to other contexts (e.g. a future
  Flutter/Dart port).
- `electron/main.cjs` is the desktop app's entry point — the window size,
  background color, and menu bar are configured there.
