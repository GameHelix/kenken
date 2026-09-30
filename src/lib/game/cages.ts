import type { Cage, Grid, Op } from "./types";

/**
 * Cage arithmetic — the rules a cage's cells must satisfy.
 *
 * `+` and `×` apply to a cage of any size. `−` and `÷` are two-cell operations:
 * subtraction reduces to |a − b| and division to (max ÷ min), so the player
 * never has to worry about the order of the two cells.
 */
export function combineFull(op: Op, values: readonly number[]): number {
  if (op === "+") return values.reduce((a, b) => a + b, 0);
  if (op === "*") return values.reduce((a, b) => a * b, 1);
  const hi = Math.max(values[0], values[1]);
  const lo = Math.min(values[0], values[1]);
  if (op === "-") return hi - lo;
  return lo === 0 ? Number.NaN : hi / lo; // op === "/"
}

/** True when every cell is filled and the cage's clue is exactly met. */
export function cageSatisfied(cage: Cage, grid: Grid): boolean {
  const values: number[] = [];
  for (const i of cage.cells) {
    const v = grid[i];
    if (v === 0) return false;
    values.push(v);
  }
  if (cage.op === null) return values[0] === cage.target;
  if (cage.op === "/") {
    const hi = Math.max(values[0], values[1]);
    const lo = Math.min(values[0], values[1]);
    return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
  }
  return combineFull(cage.op, values) === cage.target;
}

/** True when every cell in the cage carries a value. */
export function cageComplete(cage: Cage, grid: Grid): boolean {
  for (const i of cage.cells) if (grid[i] === 0) return false;
  return true;
}

/**
 * Feasibility pruning for the solver and hint engine: could this cage still be
 * completed to its target given the values placed so far? Complete cages are
 * checked exactly; partial cages use cheap arithmetic bounds.
 */
export function cageStillPossible(cage: Cage, grid: Grid, size: number): boolean {
  const filled: number[] = [];
  let empty = 0;
  for (const i of cage.cells) {
    const v = grid[i];
    if (v === 0) empty++;
    else filled.push(v);
  }

  if (cage.op === null) {
    // A given: once placed it must equal its target.
    return empty === 1 || filled[0] === cage.target;
  }

  if (cage.op === "+") {
    let sum = 0;
    for (const v of filled) sum += v;
    if (empty === 0) return sum === cage.target;
    const remaining = cage.target - sum;
    // The empty cells each hold 1..size, so the remainder is bounded.
    return remaining >= empty && remaining <= empty * size;
  }

  if (cage.op === "*") {
    let prod = 1;
    for (const v of filled) prod *= v;
    if (empty === 0) return prod === cage.target;
    if (cage.target % prod !== 0) return false;
    const remaining = cage.target / prod;
    return remaining >= 1 && remaining <= Math.pow(size, empty);
  }

  if (cage.op === "-") {
    if (empty === 0) return Math.abs(filled[0] - filled[1]) === cage.target;
    if (filled.length === 1) {
      const a = filled[0];
      const up = a + cage.target;
      const down = a - cage.target;
      return (up >= 1 && up <= size) || (down >= 1 && down <= size);
    }
    return true;
  }

  // cage.op === "/"
  if (empty === 0) {
    const hi = Math.max(filled[0], filled[1]);
    const lo = Math.min(filled[0], filled[1]);
    return lo !== 0 && hi % lo === 0 && hi / lo === cage.target;
  }
  if (filled.length === 1) {
    const a = filled[0];
    const up = a * cage.target;
    const down = a / cage.target;
    return (up >= 1 && up <= size) || (Number.isInteger(down) && down >= 1 && down <= size);
  }
  return true;
}
