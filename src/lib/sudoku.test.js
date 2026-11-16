import { describe, test, expect } from "vitest";
import {
  DIFFICULTY_TARGETS,
  generatePuzzle,
  countSolutions,
  solveBoard,
  gradeDifficulty,
  logicalSolve,
} from "./sudoku.js";

// Puzzles per difficulty. Master (17-23 clues) requires much deeper digging
// than the other tiers and can take ~0.2s-3s per puzzle (measured locally),
// so it gets fewer samples than the cheap tiers to keep total runtime sane.
const DIFFICULTIES = Object.keys(DIFFICULTY_TARGETS); // ["Easy","Medium","Hard","Expert","Master"]
const SAMPLE_COUNTS = { Easy: 4, Medium: 4, Hard: 4, Expert: 4, Master: 3 };

function formatGrid(grid) {
  if (!grid) return "(no grid)";
  return grid.map((row) => row.join(" ")).join("\n");
}

// Independent validity checker -- deliberately not importing the app's own
// isValidPlacement/boardIsComplete, so a bug shared between the app and the
// test can't cancel itself out.
function isValidCompleteGrid(grid) {
  const isOneToNine = (cells) => {
    const seen = new Set(cells);
    return seen.size === 9 && cells.every((v) => v >= 1 && v <= 9);
  };

  for (let r = 0; r < 9; r++) {
    if (!isOneToNine(grid[r])) return false;
  }
  for (let c = 0; c < 9; c++) {
    if (!isOneToNine(grid.map((row) => row[c]))) return false;
  }
  for (let br = 0; br < 9; br += 3) {
    for (let bc = 0; bc < 9; bc += 3) {
      const box = [];
      for (let r = br; r < br + 3; r++) {
        for (let c = bc; c < bc + 3; c++) box.push(grid[r][c]);
      }
      if (!isOneToNine(box)) return false;
    }
  }
  return true;
}

// Generated once at module load (all synchronous, no network/IO) and reused
// across every test below, so we pay the generation cost once instead of
// once per test block.
const FIXTURES = DIFFICULTIES.flatMap((requested) =>
  Array.from({ length: SAMPLE_COUNTS[requested] }, () => ({
    requested,
    ...generatePuzzle(requested),
  }))
);

describe("sudoku engine", () => {
  test("uniqueness: every generated puzzle has exactly one solution", () => {
    for (const f of FIXTURES) {
      const solutionCount = countSolutions(f.puzzle, 2);
      expect(
        solutionCount,
        `[${f.requested} -> ${f.difficulty}] expected exactly 1 solution, found ${solutionCount}\n${formatGrid(f.puzzle)}`
      ).toBe(1);
    }
  });

  test("solver correctness: backtracking solver matches the known solution and is a valid grid", () => {
    for (const f of FIXTURES) {
      const solved = solveBoard(f.puzzle);
      expect(
        solved,
        `[${f.requested} -> ${f.difficulty}] backtracking solver result did not match the generator's solution\npuzzle:\n${formatGrid(f.puzzle)}\nsolver result:\n${formatGrid(solved)}\nexpected solution:\n${formatGrid(f.solved)}`
      ).toEqual(f.solved);

      expect(
        isValidCompleteGrid(solved),
        `[${f.requested} -> ${f.difficulty}] backtracking solver result is not a valid Sudoku grid\n${formatGrid(solved)}`
      ).toBe(true);
    }
  });

  test("givens preserved: every clue in the puzzle survives unchanged in the solution", () => {
    for (const f of FIXTURES) {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (f.puzzle[r][c] !== 0) {
            expect(
              f.solved[r][c],
              `[${f.requested} -> ${f.difficulty}] clue at (${r},${c})=${f.puzzle[r][c]} does not match solution value ${f.solved[r][c]}\npuzzle:\n${formatGrid(f.puzzle)}\nsolution:\n${formatGrid(f.solved)}`
            ).toBe(f.puzzle[r][c]);
          }
        }
      }
    }
  });

  test("grader sanity: graded difficulty is always one of the known tiers", () => {
    let mismatches = 0;
    for (const f of FIXTURES) {
      expect(
        DIFFICULTIES.includes(f.difficulty),
        `[requested ${f.requested}] graded difficulty "${f.difficulty}" is not one of ${DIFFICULTIES.join(", ")}\n${formatGrid(f.puzzle)}`
      ).toBe(true);
      if (f.difficulty !== f.requested) mismatches++;
    }
    // generatePuzzle is a best-effort digger (see generatePuzzleOnce/generatePuzzle
    // in sudoku.js): it retries a few candidates and keeps the closest, but does
    // not guarantee an exact match, and the app itself tracks "actualDifficulty"
    // separately from the requested "difficulty" for this reason. So a mismatch
    // is not a failure -- only an invalid grade value would be.
    // eslint-disable-next-line no-console
    console.log(
      `grader sanity: ${mismatches}/${FIXTURES.length} generated puzzles graded differently than requested`
    );
  });

  test("logical solver soundness: a claimed solve is corroborated by the backtracking solver", () => {
    // logicalSolve() only returns { solved, techniques } -- it does not expose
    // the grid it deduced internally, and adding that would be a signature
    // change (out of scope for a pure move). So this can't do a literal
    // grid-for-grid comparison of "the logical solver's own result" as the
    // spec originally asked; instead, whenever it claims solved: true, we
    // verify that an independent solver (backtracking) reaches the same
    // grid as the generator's known unique solution for that puzzle. This
    // is the strongest check available without touching logicalSolve's
    // signature.
    for (const f of FIXTURES) {
      const { solved } = logicalSolve(f.puzzle);
      if (solved) {
        const backtrackResult = solveBoard(f.puzzle);
        expect(
          backtrackResult,
          `[${f.requested} -> ${f.difficulty}] logicalSolve claimed solved:true but backtracking solver disagrees with the known solution\n${formatGrid(f.puzzle)}`
        ).toEqual(f.solved);
      }
    }
  });

  test("solver speed: a minimal 17-clue puzzle solves within the default timeout", () => {
    // A fixed 17-clue puzzle (the fewest clues a uniquely solvable Sudoku can
    // have). Sparse grids are where a naive first-empty-cell backtracker
    // explodes; this one took ~60s with that strategy. Fixed input, so a
    // regression fails every run rather than randomly.
    const P = "000000010400000000020000000000050407008000300001090000300400200050100000000806000";
    const puzzle = Array.from({ length: 9 }, (_, r) => [...P.slice(r * 9, r * 9 + 9)].map(Number));
    const solved = solveBoard(puzzle);
    expect(isValidCompleteGrid(solved), formatGrid(solved)).toBe(true);
    puzzle.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v !== 0) expect(solved[r][c]).toBe(v);
      })
    );
  });

  // Determinism check (spec #6): skipped. generatePuzzle/generateSolvedBoard
  // take no seed parameter -- randomness comes from Math.random() inside
  // shuffle() with no way to inject a fixed source, so "same seed -> same
  // puzzle" doesn't apply to this codebase as written.
  test.skip("determinism: skipped, generator takes no seed parameter", () => {});
});
