import { generateLatinSquare } from "./latin";
import { makeRng, randomSeed, type Rng } from "./rng";
import { findSolutions } from "./solver";
import type { Cage, Op, Puzzle } from "./types";

/**
 * Puzzle generation:
 *   1. build a random completed Latin square (the solution),
 *   2. partition it into contiguous cages of mixed sizes,
 *   3. give each cage a valid operation and a target read off the solution,
 *   4. guarantee a unique solution by revealing forced cells as givens.
 *
 * Everything is seeded, so a puzzle is fully reproducible from its seed, and the
 * whole process stays well under a second for every supported size.
 */

export interface GenerateOptions {
  size: number;
  seed?: number | string;
}

/** Probability weight per cage size (index = size; index 0 unused). */
function cageSizeWeights(size: number): number[] {
  // Larger boards lean on bigger cages and fewer single-cell givens, which
  // makes them harder; smaller boards stay gentle.
  switch (size) {
    case 4:
      return [0, 0.12, 0.5, 0.38];
    case 5:
      return [0, 0.1, 0.44, 0.34, 0.12];
    case 7:
      return [0, 0.06, 0.36, 0.4, 0.18];
    case 6:
    default:
      return [0, 0.08, 0.42, 0.36, 0.14];
  }
}

/** Below this many givens a puzzle is considered pleasantly hard; used to stop early. */
function targetGivens(size: number): number {
  switch (size) {
    case 4:
      return 3;
    case 5:
      return 4;
    case 7:
      return 6;
    case 6:
    default:
      return 5;
  }
}

function neighbors(index: number, size: number): number[] {
  const r = Math.floor(index / size);
  const c = index % size;
  const out: number[] = [];
  if (r > 0) out.push(index - size);
  if (r < size - 1) out.push(index + size);
  if (c > 0) out.push(index - 1);
  if (c < size - 1) out.push(index + 1);
  return out;
}

/** Grow contiguous cages over the whole grid, returning a cage id per cell. */
function partition(size: number, rng: Rng, weights: number[]): number[] {
  const n = size * size;
  const cageOf = new Array<number>(n).fill(-1);
  const order = rng.shuffle(Array.from({ length: n }, (_, i) => i));
  let id = 0;

  for (const start of order) {
    if (cageOf[start] !== -1) continue;
    const wanted = Math.max(1, rng.weighted(weights));
    cageOf[start] = id;
    const cells = [start];
    while (cells.length < wanted) {
      const frontier: number[] = [];
      for (const cell of cells) {
        for (const nb of neighbors(cell, size)) if (cageOf[nb] === -1) frontier.push(nb);
      }
      if (frontier.length === 0) break;
      const chosen = rng.pick(frontier);
      cageOf[chosen] = id;
      cells.push(chosen);
    }
    id++;
  }
  return cageOf;
}

function sum(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function product(values: readonly number[]): number {
  return values.reduce((a, b) => a * b, 1);
}

/** Pick an operation and target for a cage, consistent with the solution. */
function clueFor(cells: number[], solution: number[], rng: Rng): { op: Op | null; target: number } {
  const values = cells.map((i) => solution[i]);
  if (cells.length === 1) return { op: null, target: values[0] };

  if (cells.length === 2) {
    const [a, b] = values;
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    const options: { op: Op; target: number; weight: number }[] = [
      { op: "-", target: hi - lo, weight: 4 },
      { op: "+", target: a + b, weight: 2 },
      { op: "*", target: a * b, weight: 2 },
    ];
    if (hi % lo === 0) options.push({ op: "/", target: hi / lo, weight: 4 });
    const choice = options[rng.weighted(options.map((o) => o.weight))];
    return { op: choice.op, target: choice.target };
  }

  // Three or more cells: + or ×, with × discouraged as the cage grows so the
  // targets stay human-readable.
  const options: { op: Op; target: number; weight: number }[] = [
    { op: "+", target: sum(values), weight: 3 },
    { op: "*", target: product(values), weight: cells.length >= 4 ? 1 : 2 },
  ];
  const choice = options[rng.weighted(options.map((o) => o.weight))];
  return { op: choice.op, target: choice.target };
}

function buildCages(cageOf: number[], solution: number[], rng: Rng): Cage[] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < cageOf.length; i++) {
    const list = groups.get(cageOf[i]);
    if (list) list.push(i);
    else groups.set(cageOf[i], [i]);
  }
  const cages: Cage[] = [];
  let id = 0;
  for (const cells of groups.values()) {
    cells.sort((a, b) => a - b);
    const clue = clueFor(cells, solution, rng);
    cages.push({ id: id++, cells, op: clue.op, target: clue.target });
  }
  return cages;
}

function cageOfFrom(cages: Cage[], size: number): number[] {
  const cageOf = new Array<number>(size * size).fill(-1);
  for (const cage of cages) for (const cell of cage.cells) cageOf[cell] = cage.id;
  return cageOf;
}

function countGivens(cages: Cage[]): number {
  let g = 0;
  for (const cage of cages) if (cage.op === null) g++;
  return g;
}

/** Recompute a cage's target after it loses a cell, keeping its operation valid. */
function recomputeClue(cage: Cage, solution: number[]): void {
  const values = cage.cells.map((i) => solution[i]);
  if (cage.cells.length === 1) {
    cage.op = null;
    cage.target = values[0];
    return;
  }
  if (cage.op === "+") cage.target = sum(values);
  else if (cage.op === "*") cage.target = product(values);
  else {
    const hi = Math.max(values[0], values[1]);
    const lo = Math.min(values[0], values[1]);
    if (cage.op === "/" && hi % lo !== 0) {
      cage.op = "-";
      cage.target = hi - lo;
    } else if (cage.op === "/") {
      cage.target = hi / lo;
    } else {
      cage.target = hi - lo; // op === "-"
    }
  }
}

/** Reveal `cell` as a given by splitting it out of its cage into a singleton. */
function revealGiven(puzzle: Puzzle, cell: number): Puzzle {
  const cages = puzzle.cages.map((c) => ({ ...c, cells: [...c.cells] }));
  const owner = cages.find((c) => c.id === puzzle.cageOf[cell]);
  if (!owner) return puzzle;

  owner.cells = owner.cells.filter((i) => i !== cell);
  const newId = cages.reduce((m, c) => Math.max(m, c.id), -1) + 1;
  cages.push({ id: newId, cells: [cell], op: null, target: puzzle.solution[cell] });
  if (owner.cells.length > 0) recomputeClue(owner, puzzle.solution);

  const live = cages.filter((c) => c.cells.length > 0);
  return {
    size: puzzle.size,
    cages: live,
    cageOf: cageOfFrom(live, puzzle.size),
    solution: puzzle.solution,
  };
}

/** Add givens at forced cells until the puzzle has a single solution. */
function ensureUnique(puzzle: Puzzle): Puzzle {
  let current = puzzle;
  const guard = puzzle.size * puzzle.size;
  for (let step = 0; step <= guard; step++) {
    const solutions = findSolutions(current, 2);
    if (solutions.length <= 1) return current;
    const [a, b] = solutions;
    let diff = -1;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        diff = i;
        break;
      }
    }
    if (diff < 0) return current;
    current = revealGiven(current, diff);
  }
  return current;
}

export function generatePuzzle(options: GenerateOptions): Puzzle {
  const seed = options.seed ?? randomSeed();
  const rng = makeRng(seed);
  const size = options.size;
  const solution = generateLatinSquare(size, rng);
  const weights = cageSizeWeights(size);
  const goal = targetGivens(size);

  let best: Puzzle | null = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const cageOf = partition(size, rng, weights);
    const cages = buildCages(cageOf, solution, rng);
    const candidate = ensureUnique({
      size,
      cages,
      cageOf: cageOfFrom(cages, size),
      solution,
    });
    if (best === null || countGivens(candidate.cages) < countGivens(best.cages)) {
      best = candidate;
    }
    if (countGivens(candidate.cages) <= goal) return candidate;
  }
  // `best` is always assigned on the first iteration.
  return best as Puzzle;
}
