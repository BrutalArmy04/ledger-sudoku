# Ledger Sudoku

A premium, ad-free Sudoku app with a clean paper-and-pencil aesthetic.
Classic 9×9 puzzles with pencil notes, hints, mistake tracking, undo, and
light/dark themes — plus a real difficulty grader that checks which solving
techniques a puzzle actually requires, not just how many clues are missing.

Built with React + Vite and packaged with Electron. Runs in the browser on
desktop **and phones**, and as a native app on Windows, Linux, and macOS.

**[▶ Play it in your browser](https://brutalarmy04.github.io/ledger-sudoku/)**
— nothing to install.

## Download

Every [release](https://github.com/BrutalArmy04/ledger-sudoku/releases/latest)
includes native builds:

| Platform | Files |
| --- | --- |
| **Windows** | `Setup` installer (Start Menu entry + shortcut), or a portable `.exe` — just double-click and play |
| **Linux** | `.AppImage` (portable) and `.deb` |
| **macOS** | `.dmg` |

The apps aren't code-signed, so first launch needs one extra click:

- **Windows** — on the SmartScreen prompt, click **More info → Run anyway**.
- **macOS** — Gatekeeper blocks it; right-click the app → **Open**.

## Run from source

```bash
npm install
npm run dev            # web version at http://localhost:5173
npm run electron:dev   # same app in its own desktop window
npm test               # puzzle-engine test suite (Vitest)
```

## Build it yourself

```bash
npm run build       # static web build in dist/
npm run dist:win    # Windows installer + portable exe (in release/)
npm run dist:linux  # AppImage + deb — must be run on Linux
npm run dist:mac    # dmg — must be run on macOS
```

The first packaging run downloads Electron's build tools — a few minutes,
once. Cross-platform releases are automated: pushing a tag `v*` runs the
test suite, then builds all three platforms on GitHub Actions and attaches
the artifacts to a Release.

## How it's built

The puzzle engine — generator, backtracking solver, human-style logical
solver, and difficulty grader — lives in `src/lib/sudoku.js` as pure
JavaScript with no framework dependencies. It's covered by property tests
in `src/lib/sudoku.test.js`; the key invariant is that **every generated
puzzle is verified to have exactly one solution** before either CI pipeline
(the Pages deploy or a release build) is allowed to proceed.

The React UI is in `src/App.jsx`, and the desktop entry point — window
setup and per-platform menu handling — is in `electron/main.cjs`.

Design decisions and the bugs behind them (why the layout had to be
restructured to become responsive, how notes were unreachable on every
touch device, what breaks over `file://`, and how the engine is tested) are
written up in **[ENGINEERING.md](ENGINEERING.md)**.

## Notes

Stats (best times, streaks) are kept in memory only and reset when the app
closes. The `statsRef` object in `src/App.jsx` is where you'd wire up
persistent storage.
