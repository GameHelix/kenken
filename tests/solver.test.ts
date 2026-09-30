import { describe, expect, it } from "vitest";
import { countSolutions, findSolutions, solveOne } from "@/lib/game/solver";
import { generateLatinSquare } from "@/lib/game/latin";
import { makeRng } from "@/lib/game/rng";
import type { Puzzle } from "@/lib/game/types";

describe("solver", () => {
  // A known, uniquely-solvable 3×3 board. Solution:
  //   1 2 3
  //   2 3 1
  //   3 1 2
  // The single given at cell 0 breaks the mirror symmetry, so the deduction is
  // forced at every step — exactly one solution.
  const puzzle: Puzzle = {
    size: 3,
    solution: [1, 2, 3, 2, 3, 1, 3, 1, 2],
    cageOf: [0, 2, 3, 1, 2, 3, 1, 4, 4],
    cages: [
      { id: 0, cells: [0], op: null, target: 1 },
      { id: 1, cells: [3, 6], op: "-", target: 1 },
      { id: 2, cells: [1, 4], op: "+", target: 5 },
      { id: 3, cells: [2, 5], op: "-", target: 2 },
      { id: 4, cells: [7, 8], op: "+", target: 3 },
    ],
  };

  it("solves a known board to its solution", () => {
    const solved = solveOne(puzzle);
    expect(solved).toEqual(puzzle.solution);
  });

  it("counts exactly one solution and stops at the limit", () => {
    expect(countSolutions(puzzle, 2)).toBe(1);
    expect(findSolutions(puzzle, 2)).toHaveLength(1);
  });

  it("finds multiple solutions for an under-constrained board", () => {
    // A single all-encompassing sum cage leaves many Latin squares valid.
    const size = 4;
    const all = Array.from({ length: size * size }, (_, i) => i);
    const under: Puzzle = {
      size,
      solution: generateLatinSquare(size, makeRng(1)),
      cageOf: new Array(size * size).fill(0),
      cages: [{ id: 0, cells: all, op: "+", target: 40 }], // each row sums to 10 → 40 total
    };
    // Stopping at 2 proves it is not unique without enumerating everything.
    expect(countSolutions(under, 2)).toBe(2);
  });
});
