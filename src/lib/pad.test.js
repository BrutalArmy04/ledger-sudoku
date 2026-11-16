import { describe, test, expect } from "vitest";
import { digitPadState } from "./pad.js";

// A fixed valid solution, written out by hand (not produced by the engine).
const SOLUTION = [
  [5, 3, 4, 6, 7, 8, 9, 1, 2],
  [6, 7, 2, 1, 9, 5, 3, 4, 8],
  [1, 9, 8, 3, 4, 2, 5, 6, 7],
  [8, 5, 9, 7, 6, 1, 4, 2, 3],
  [4, 2, 6, 8, 5, 3, 7, 9, 1],
  [7, 1, 3, 9, 2, 4, 8, 5, 6],
  [9, 6, 1, 5, 3, 7, 2, 8, 4],
  [2, 8, 7, 4, 1, 9, 6, 3, 5],
  [3, 4, 5, 2, 8, 6, 1, 7, 9],
];

const empty = () => Array.from({ length: 9 }, () => Array(9).fill(0));
const solved = () => SOLUTION.map((r) => r.slice());

// Every cell where SOLUTION holds `n`, as [r, c].
const cellsOf = (n) =>
  SOLUTION.flatMap((row, r) => row.flatMap((v, c) => (v === n ? [[r, c]] : [])));

// A cell that should hold `n` but gets `wrong` instead.
function withWrongCopy(n, wrong) {
  const g = empty();
  const [[r0, c0], ...rest] = cellsOf(wrong);
  rest.forEach(([r, c]) => (g[r][c] = wrong)); // 8 correct copies of `wrong`
  const [r, c] = cellsOf(n)[0];
  g[r][c] = wrong; // 1 misplaced copy of `wrong`
  return { grid: g, missing: [r0, c0] };
}

describe.each([true, false])("digit pad (autoCheck=%s)", (autoCheck) => {
  test("an empty board leaves all nine of every digit", () => {
    const pad = digitPadState(empty(), SOLUTION, autoCheck);
    for (let n = 1; n <= 9; n++) {
      expect(pad[n]).toEqual({ remaining: 9, dimmed: false, disabled: false });
    }
  });

  test("a fully solved board leaves zero of every digit", () => {
    const pad = digitPadState(solved(), SOLUTION, autoCheck);
    for (let n = 1; n <= 9; n++) {
      expect(pad[n].remaining).toBe(0);
      expect(pad[n].dimmed).toBe(true);
    }
  });

  test("remaining never goes negative, even with more than nine copies", () => {
    const g = solved();
    g[0][1] = 5; // a tenth 5, on a cell whose answer is 3
    const pad = digitPadState(g, SOLUTION, autoCheck);
    for (let n = 1; n <= 9; n++) expect(pad[n].remaining).toBeGreaterThanOrEqual(0);
  });
});

describe("digit pad with auto-check on", () => {
  test("a wrong copy does not use up a digit", () => {
    const { grid } = withWrongCopy(1, 5); // eight correct 5s + one 5 where a 1 belongs
    const pad = digitPadState(grid, SOLUTION, true);
    expect(pad[5]).toEqual({ remaining: 1, dimmed: false, disabled: false });
  });

  test("a digit is disabled only once all nine correct copies are placed", () => {
    const g = empty();
    cellsOf(7).forEach(([r, c]) => (g[r][c] = 7));
    const pad = digitPadState(g, SOLUTION, true);
    expect(pad[7]).toEqual({ remaining: 0, dimmed: true, disabled: true });
    expect(pad[6].disabled).toBe(false);
  });
});

describe("digit pad with auto-check off", () => {
  test("every placed copy counts, right or wrong (no hint about which is wrong)", () => {
    const { grid } = withWrongCopy(1, 5);
    const pad = digitPadState(grid, SOLUTION, false);
    expect(pad[5].remaining).toBe(0);
    expect(pad[5].dimmed).toBe(true);
  });

  test("a digit is never disabled, so it can always be disarmed or re-used", () => {
    for (const grid of [empty(), solved(), withWrongCopy(1, 5).grid]) {
      const pad = digitPadState(grid, SOLUTION, false);
      for (let n = 1; n <= 9; n++) expect(pad[n].disabled).toBe(false);
    }
  });

  test("a fully correct digit looks the same as one with a wrong copy", () => {
    const allCorrect = empty();
    cellsOf(5).forEach(([r, c]) => (allCorrect[r][c] = 5));
    const oneWrong = withWrongCopy(1, 5).grid;
    expect(digitPadState(oneWrong, SOLUTION, false)[5]).toEqual(
      digitPadState(allCorrect, SOLUTION, false)[5]
    );
  });
});
