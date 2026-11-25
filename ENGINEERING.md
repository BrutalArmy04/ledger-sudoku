# Engineering notes

Design decisions and problems worth documenting from building Ledger Sudoku.
Each section is a real issue encountered in this repo, why it happened, and
what the fix was — not a feature list.

---

## 1. Why the app couldn't be made responsive without restructuring it

The app was originally styled entirely with React inline styles
(`style={{}}`). An inline style compiles to the HTML `style` attribute,
which can hold **declarations only** — no selectors, no cascade, no
at-rules. A media query is an at-rule, so it *cannot be expressed* in an
inline style. The app wasn't missing breakpoints; it was structurally
incapable of having them.

The fix was a split by responsibility:

- **Sizing** moved to a real stylesheet (`src/index.css`), where media
  queries can live.
- **Colour** stayed inline, because it is genuinely dynamic — computed in
  JS from theme × accent.
- The two layers meet through CSS custom properties: JS passes the *ideal*
  size (`--cell-ideal`), and CSS decides whether it *fits*.

```css
--cell: min(
  var(--cell-ideal),                        /* what the user asked for   */
  calc((100cqw - var(--board-chrome)) / 9), /* what the width allows     */
  calc((100cqh - var(--board-chrome)) / 9)  /* what the height allows    */
);
```

On desktop the ideal always wins, so the desktop layout is pixel-identical
to the pre-responsive build — verified by resolving both code paths at
every font-scale setting. On a phone the fit terms win. Details that
matter:

- **Container query units (`cqw`/`cqh`) instead of `vw`/`vh`** — they
  measure the space actually left over for the board after the surrounding
  UI is laid out, instead of hard-coding a guess at the chrome's height.
  The board wrapper is `flex: 1 1 0` (basis *zero*), so its size comes
  purely from leftover space and never from its own content — that is what
  keeps the container query non-circular.
- **`min()` instead of JS resize listeners** — no re-render on rotation,
  no layout thrash, and correct on first paint.
- **Explicit `var(--cell)` grid tracks instead of `1fr`** — the board's
  ruled-paper effect is a `repeating-linear-gradient` whose period must
  match the cell size exactly. A fractional track has no length the
  gradient can be tied to, so the ruling would drift out of register.
  One shared custom property keeps grid and gradient locked.

## 2. The bug my own verification caught

The first version of the sizing rule had a floor:
`--cell: max(28px, min(...))`, on the theory that cells below 28px are
unusable. Resolving the CSS by hand for real devices showed the iPhone SE
(375×553 effective viewport) **overflowing**: the floor was winning against
the fit constraint. A minimum size can only be honoured by overflowing the
screen, which defeats the entire point of the rule. The floor was removed —
`min()` alone makes "it always fits" true *by construction*, and a small
cell you can pinch-zoom beats a board you have to pan.

## 3. Notes were unreachable on every touch device

The layout was the visible problem; this was the real one. Pencil marks
(notes) could only be entered via **right-click** (`onContextMenu`).
Touchscreens have no right-click — iOS Safari doesn't even fire
`contextmenu` on long-press — and the tap path hard-coded `isNote = false`.
The Notes button in the toolbar was therefore *decorative* on phones: it
toggled a mode that no touch input path ever read.

Fix: the tap path now respects the Notes toggle, and a cell-first flow
(select a cell, then tap digits) was added — both gated on
`matchMedia("(pointer: coarse)")`, so mouse behaviour is unchanged:
left-click answers, right-click notes.

The general principle: **`pointer`/`hover` media features answer "what can
this device do", width queries answer "how much room is there".** Those are
different questions — a 1024px tablet is coarse, a 500px desktop window is
not — and conflating them is how apps end up usable on neither.

## 4. Touch target budget

Nine columns on a 390px screen means ~43px cells at the absolute best, so
the board can never meet Apple's 44pt / Material's 48dp touch-target
guidance. The budget goes where the errors are expensive: the board is
where you *look*, the number pad is where you *tap*. On narrow screens the
pad reflows from 9×1 (~34×41px targets) to 5×2 (~69×48px), and the freed
tenth slot becomes Erase — the most frequent correction, moved under the
thumb. `user-scalable=no` was deliberately **not** added: blocking zoom is
a WCAG 1.4.4 failure; the goal is to make zooming unnecessary, not
forbidden.

## 5. One codebase, `file://` and `https://`

The same build runs on GitHub Pages and inside Electron, which loads it
over `file://`. Vite emits a `crossorigin` attribute on the module script
that Chromium rejects over `file://`, so a post-build script
(`scripts/fix-electron-html.cjs`) strips it. This is a *protocol* issue,
not a Windows issue — which is why the Linux and macOS packaging scripts
run the same fix. (An earlier draft of the build config skipped it for
non-Windows targets, which would have shipped Linux/macOS builds that open
to a blank window.)

Related macOS-only trap: the app hides its menu bar with
`Menu.setApplicationMenu(null)`. On Windows/Linux that hides a cosmetic
bar; on macOS it deletes the **application menu**, taking ⌘Q, ⌘C/⌘V and
⌘W with it — the app looks frozen. The call is now branched on
`process.platform`, with a minimal menu built from Electron's built-in
`appMenu`/`editMenu`/`windowMenu` roles on macOS (roles ship the correct,
localized accelerators; hand-rolling them is how ⌘Q ends up broken).

## 6. Testing the engine, not the app's opinion of itself

The puzzle engine (generator, backtracking solver, logical solver, grader)
was extracted verbatim from the UI into `src/lib/sudoku.js` — it was
already pure functions with no React imports, so the move is a move, not a
refactor. The Vitest suite over it asserts *properties*, not snapshots:

- **Uniqueness** — every generated puzzle, at every difficulty, has
  exactly one solution (`countSolutions === 1`). This is the invariant the
  whole game rests on.
- **Solver correctness** — the solver's output matches the generator's
  known solution *and* passes an independent validity checker written
  inside the test file. The app's own validation helpers are deliberately
  not used to check the app: a shared bug would let both pass.
- **Givens preserved**, **grader emits only known tiers**, and **logical
  solver claims are corroborated** by the backtracking solver.
- The grader-matches-requested-difficulty check **logs** mismatches rather
  than failing on them, because the generator is a best-effort digger —
  the app itself tracks `actualDifficulty` separately from the requested
  one. Tests encode the contract the code actually has, not the one a
  green run suggests it might.

Both CI pipelines are gated on this suite: the GitHub Pages deploy and the
tag-triggered release workflow (`test` job → three-OS build matrix). A
broken engine can reach neither the live site nor a packaged download.

## 7. Releases

Pushing a tag `v*` triggers a matrix build on `windows-latest` /
`ubuntu-latest` / `macos-latest`, producing NSIS + portable (Windows),
AppImage + deb (Linux), and dmg + zip (macOS, universal binary), attached
to a GitHub Release. Build and publish are separate steps
(`electron-builder --publish never` + a release-upload action) so upload
failures are re-runnable without rebuilding. The macOS artifacts are
unsigned — signing requires a paid Apple Developer account and
notarization secrets, which is out of proportion for this project; the
README documents the right-click → Open workaround instead.

## 8. Known limitations

**Stats across browser tabs.** Stats live in one localStorage key shared by
every tab. Each update re-reads that key before writing, and other tabs
refresh their display from `storage` events, so a stale tab no longer
overwrites another tab's wins. What is still shared is the single
`gameInProgress` flag: it records that *a* game is in progress, not whose.
With two tabs open:

- opening a second tab while the first is mid-game records that game as
  abandoned, because the launch-time check can't tell a game that's live in
  another tab from one left by closing the app; the first tab's next answer
  then counts its game as played a second time;
- when both tabs have a game in progress, one tab's Menu exit, new puzzle or
  win also clears the other's flag, so games played can be off by one and a
  streak can reset early.

Two-tab play only happens in the browser version. This will be solved by
per-game records when stats move to the API, not by adding game ids to
localStorage.
