import { cageStillPossible } from "./cages";
import type { Cage, Grid, Puzzle } from "./types";

export interface Hint {
  index: number;
  value: number;
}

/**
 * Find one cell the player can fill by pure deduction.
 *
 * The strong case is a "naked single": an empty cell with exactly one value
 * that both respects its row/column and keeps its cage feasible — genuinely
 * forced, and (on a consistent board) necessarily the solution value. If none
 * exists, fall back to the most-constrained empty cell and reveal its solution
 * value, so a hint is always available and always correct.
 */
export function findHint(puzzle: Puzzle, grid: Grid): Hint | null {
  const { size, solution } = puzzle;
  const cageById = new Map<number, Cage>();
  for (const cage of puzzle.cages) cageById.set(cage.id, cage);

  const work = grid.slice();
  let fallback: { index: number; count: number } | null = null;

  for (let i = 0; i < size * size; i++) {
    if (grid[i] !== 0) continue;
    const r = Math.floor(i / size);
    const c = i % size;
    const cage = cageById.get(puzzle.cageOf[i]);

    const candidates: number[] = [];
    for (let v = 1; v <= size; v++) {
      let ok = true;
      for (let k = 0; k < size; k++) {
        if (grid[r * size + k] === v || grid[k * size + c] === v) {
          ok = false;
          break;
        }
      }
      if (ok && cage) {
        work[i] = v;
        ok = cageStillPossible(cage, work, size);
        work[i] = 0;
      }
      if (ok) candidates.push(v);
    }

    if (candidates.length === 1 && candidates[0] === solution[i]) {
      return { index: i, value: candidates[0] };
    }
    if (candidates.length > 0 && (fallback === null || candidates.length < fallback.count)) {
      fallback = { index: i, count: candidates.length };
    }
  }

  if (fallback) return { index: fallback.index, value: solution[fallback.index] };
  return null;
}
