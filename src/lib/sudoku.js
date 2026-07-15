/* ============================================================
   ENGINE — generator, solver, grader
   ============================================================ */

export const SIZE = 9;
export const BOX = 3;

export function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

export function cloneGrid(g) {
  return g.map((r) => r.slice());
}

export function peers(r, c) {
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

export function candidates(grid, r, c) {
  if (grid[r][c] !== 0) return [];
  const used = new Set();
  for (const [pr, pc] of peers(r, c)) {
    if (grid[pr][pc] !== 0) used.add(grid[pr][pc]);
  }
  const out = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n);
  return out;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fill a board completely via randomized backtracking
export function fillBoard(grid) {
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

export function generateSolvedBoard() {
  const g = emptyGrid();
  fillBoard(g);
  return g;
}

// Count solutions up to a cap (2 is enough to know "not unique")
export function countSolutions(grid, cap = 2) {
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
export function logicalSolve(grid) {
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

export const DIFFICULTY_TARGETS = {
  Easy: { minClues: 38, maxClues: 45 },
  Medium: { minClues: 32, maxClues: 37 },
  Hard: { minClues: 28, maxClues: 31 },
  Expert: { minClues: 24, maxClues: 27 },
  Master: { minClues: 17, maxClues: 23 },
};

// Tiers are cumulative: each tier's technique set is a superset of easier tiers.
// A puzzle's "technique tier" is the tier of the hardest technique it required.
export const TECHNIQUE_TIER = {
  "Naked Single": 0,
  "Hidden Single": 0,
  "Naked Pairs": 1,
  "Pointing Pairs": 2,
};
export const TIER_NAMES = ["Easy", "Medium", "Hard", "Expert"]; // index = tier; unsolved -> Master

export function gradeDifficulty(grid) {
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
export function generatePuzzleOnce(difficulty) {
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
export function generatePuzzle(difficulty) {
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

export function solveBoard(grid) {
  const g = cloneGrid(grid);
  fillBoard(g);
  return g;
}

export function isValidPlacement(grid, r, c, n) {
  if (n === 0) return true;
  for (const [pr, pc] of peers(r, c)) {
    if (grid[pr][pc] === n) return false;
  }
  return true;
}

export function boardIsComplete(grid) {
  return grid.every((row) => row.every((v) => v !== 0));
}
