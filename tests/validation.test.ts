import { describe, expect, it } from "vitest";
import { findCageViolations, findConflicts, isSolved } from "@/lib/game/validation";
import type { Puzzle } from "@/lib/game/types";

describe("Latin-square conflict detection", () => {
  it("flags duplicates within a row", () => {
    // 3-wide grid: row 0 has two 2s.
    const grid = [2, 2, 1, 0, 0, 0, 0, 0, 0];
    const bad = findConflicts(grid, 3);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(1)).toBe(true);
    expect(bad.has(2)).toBe(false);
  });

  it("flags duplicates within a column", () => {
    // column 0 has two 3s (indices 0 and 3 on a 3-wide grid).
    const grid = [3, 1, 2, 3, 0, 0, 0, 0, 0];
    const bad = findConflicts(grid, 3);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(3)).toBe(true);
    expect(bad.has(1)).toBe(false);
  });

  it("reports no conflicts for a valid partial board", () => {
    const grid = [1, 2, 3, 2, 3, 1, 0, 0, 0];
    expect(findConflicts(grid, 3).size).toBe(0);
  });
});

describe("win detection", () => {
  // A tiny hand-made 3×3 puzzle (not offered in the UI, but valid for the rules).
  const solution = [1, 2, 3, 2, 3, 1, 3, 1, 2];
  const puzzle: Puzzle = {
    size: 3,
    solution,
    cageOf: [0, 0, 1, 2, 2, 1, 3, 3, 1],
    cages: [
      { id: 0, cells: [0, 1], op: "+", target: 3 },
      { id: 1, cells: [2, 5, 8], op: "*", target: 6 },
      { id: 2, cells: [3, 4], op: "+", target: 5 },
      { id: 3, cells: [6, 7], op: "-", target: 2 },
    ],
  };

  it("accepts the completed solution", () => {
    expect(isSolved(puzzle, solution)).toBe(true);
  });

  it("rejects an incomplete board", () => {
    const partial = solution.slice();
    partial[8] = 0;
    expect(isSolved(puzzle, partial)).toBe(false);
  });

  it("rejects a full board that breaks a cage", () => {
    // Swap two cells so a cage total is wrong while the Latin rule may still fail.
    const wrong = [1, 2, 3, 3, 2, 1, 2, 1, 3];
    expect(isSolved(puzzle, wrong)).toBe(false);
  });

  it("marks the cells of a fully-filled but wrong cage", () => {
    // Fill only cage 0 (cells 0,1) with a wrong sum.
    const grid = [3, 3, 0, 0, 0, 0, 0, 0, 0];
    const bad = findCageViolations(puzzle, grid);
    expect(bad.has(0)).toBe(true);
    expect(bad.has(1)).toBe(true);
  });
});
