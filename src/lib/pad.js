/* ============================================================
   NUMBER PAD — how many of each digit are left, and whether its
   button is dimmed or disabled.

   Auto-check on: mistakes are already shown in red, so only CORRECT
   copies use up a digit. A digit with a wrong copy stays available,
   and is disabled only once all nine correct copies are on the board.

   Auto-check off: every placed copy counts, right or wrong, so the pad
   can't reveal which digit is wrong. The button dims at zero but is
   never disabled, so an armed digit can always be disarmed.

   Returns an array indexed 1..9 (index 0 unused) of
   { remaining, dimmed, disabled }.
   ============================================================ */

export function digitPadState(grid, solution, autoCheck) {
  const placed = Array(10).fill(0);
  if (grid) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const v = grid[r][c];
        if (!v) continue;
        if (!autoCheck || (solution && solution[r][c] === v)) placed[v]++;
      }
    }
  }
  return placed.map((count) => {
    const remaining = Math.max(0, 9 - count);
    const dimmed = remaining === 0;
    return { remaining, dimmed, disabled: autoCheck && dimmed };
  });
}
