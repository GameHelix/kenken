import { OP_SYMBOL } from "./constants";
import { cageComplete, cageSatisfied } from "./cages";
import type { Grid, Puzzle } from "./types";

/**
 * Board-state derivations used by the UI: Latin-square conflict detection, cage
 * violations, win detection, plus the presentation helpers (cage borders,
 * clue labels, the starting grid) that turn a `Puzzle` into something drawable.
 */

/** Cells whose value repeats within their row or column. */
export function findConflicts(grid: Grid, size: number): Set<number> {
  const bad = new Set<number>();

  for (let r = 0; r < size; r++) {
    const seen = new Map<number, number[]>();
    for (let c = 0; c < size; c++) {
      const i = r * size + c;
      const v = grid[i];
      if (v === 0) continue;
      const list = seen.get(v);
      if (list) list.push(i);
      else seen.set(v, [i]);
    }
    for (const list of seen.values()) if (list.length > 1) for (const i of list) bad.add(i);
  }

  for (let c = 0; c < size; c++) {
    const seen = new Map<number, number[]>();
    for (let r = 0; r < size; r++) {
      const i = r * size + c;
      const v = grid[i];
      if (v === 0) continue;
      const list = seen.get(v);
      if (list) list.push(i);
      else seen.set(v, [i]);
    }
    for (const list of seen.values()) if (list.length > 1) for (const i of list) bad.add(i);
  }

  return bad;
}

/** Cells of any fully-filled cage whose arithmetic is wrong. */
export function findCageViolations(puzzle: Puzzle, grid: Grid): Set<number> {
  const bad = new Set<number>();
  for (const cage of puzzle.cages) {
    if (cageComplete(cage, grid) && !cageSatisfied(cage, grid)) {
      for (const i of cage.cells) bad.add(i);
    }
  }
  return bad;
}

/** True when the board is full, Latin-valid and every cage is satisfied. */
export function isSolved(puzzle: Puzzle, grid: Grid): boolean {
  const n = puzzle.size * puzzle.size;
  for (let i = 0; i < n; i++) if (grid[i] === 0) return false;
  if (findConflicts(grid, puzzle.size).size > 0) return false;
  for (const cage of puzzle.cages) if (!cageSatisfied(cage, grid)) return false;
  return true;
}

export interface CellBorders {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

const GRID_LINE = "1px solid var(--kk-grid-line)";
const CAGE_LINE = "2px solid var(--kk-cage-line)";
const NO_LINE = "0px solid transparent";

/**
 * Border CSS per cell. Bold lines mark cage boundaries, thin lines separate
 * same-cage cells. Only right/bottom carry the inner lines (the neighbour draws
 * the shared edge once), so every seam is a single crisp stroke.
 */
export function computeBorders(puzzle: Puzzle): CellBorders[] {
  const { size, cageOf } = puzzle;
  const result: CellBorders[] = [];
  for (let i = 0; i < size * size; i++) {
    const r = Math.floor(i / size);
    const c = i % size;
    const right = c === size - 1 || cageOf[i] !== cageOf[i + 1] ? CAGE_LINE : GRID_LINE;
    const bottom = r === size - 1 || cageOf[i] !== cageOf[i + size] ? CAGE_LINE : GRID_LINE;
    result.push({
      top: r === 0 ? CAGE_LINE : NO_LINE,
      left: c === 0 ? CAGE_LINE : NO_LINE,
      right,
      bottom,
    });
  }
  return result;
}

/** Clue label ("6+", "3×"…) per cell, on each multi-cell cage's top-left cell. */
export function cageLabels(puzzle: Puzzle): (string | null)[] {
  const labels = new Array<string | null>(puzzle.size * puzzle.size).fill(null);
  for (const cage of puzzle.cages) {
    if (cage.op === null) continue; // single givens show their value instead
    labels[cage.cells[0]] = `${cage.target}${OP_SYMBOL[cage.op]}`;
  }
  return labels;
}

/** Starting grid with single-cell givens pre-filled, everything else empty. */
export function initialGrid(puzzle: Puzzle): Grid {
  const grid = new Array<number>(puzzle.size * puzzle.size).fill(0);
  for (const cage of puzzle.cages) if (cage.op === null) grid[cage.cells[0]] = cage.target;
  return grid;
}

/** Which cells are given (locked, not editable). */
export function lockedCells(puzzle: Puzzle): boolean[] {
  const locked = new Array<boolean>(puzzle.size * puzzle.size).fill(false);
  for (const cage of puzzle.cages) if (cage.op === null) locked[cage.cells[0]] = true;
  return locked;
}
