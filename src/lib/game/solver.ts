import { cageStillPossible } from "./cages";
import type { Cage, Grid, Puzzle } from "./types";

/**
 * Backtracking solver over the Latin-square constraints with per-cage
 * arithmetic pruning. It powers generation, uniqueness checking and hints.
 *
 * Cells are filled in index order; after each placement only the affected
 * cage is re-checked, which keeps the search cheap for N ≤ 7.
 */
export function findSolutions(puzzle: Puzzle, limit: number): Grid[] {
  const { size } = puzzle;
  const n = size * size;
  const grid = new Array<number>(n).fill(0);
  const rowUsed = Array.from({ length: size }, () => new Array<boolean>(size + 1).fill(false));
  const colUsed = Array.from({ length: size }, () => new Array<boolean>(size + 1).fill(false));

  const cageById = new Map<number, Cage>();
  for (const cage of puzzle.cages) cageById.set(cage.id, cage);

  const solutions: Grid[] = [];

  function search(pos: number): void {
    if (solutions.length >= limit) return;
    if (pos === n) {
      solutions.push(grid.slice());
      return;
    }
    const r = Math.floor(pos / size);
    const c = pos % size;
    for (let v = 1; v <= size; v++) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      grid[pos] = v;
      rowUsed[r][v] = true;
      colUsed[c][v] = true;
      const cage = cageById.get(puzzle.cageOf[pos]);
      if (cage && cageStillPossible(cage, grid, size)) search(pos + 1);
      grid[pos] = 0;
      rowUsed[r][v] = false;
      colUsed[c][v] = false;
      if (solutions.length >= limit) return;
    }
  }

  search(0);
  return solutions;
}

/** Count solutions, stopping as soon as `limit` (default 2) is reached. */
export function countSolutions(puzzle: Puzzle, limit = 2): number {
  return findSolutions(puzzle, limit).length;
}

/** The first solution, or `null` if the puzzle is unsatisfiable. */
export function solveOne(puzzle: Puzzle): Grid | null {
  const found = findSolutions(puzzle, 1);
  return found.length > 0 ? found[0] : null;
}

/** True when the puzzle has exactly one solution. */
export function hasUniqueSolution(puzzle: Puzzle): boolean {
  return countSolutions(puzzle, 2) === 1;
}
