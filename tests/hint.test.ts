import { describe, expect, it } from "vitest";
import { findHint } from "@/lib/game/hint";
import { generatePuzzle } from "@/lib/game/generator";
import { initialGrid } from "@/lib/game/validation";
import type { Puzzle } from "@/lib/game/types";

const puzzle: Puzzle = {
  size: 3,
  solution: [1, 2, 3, 2, 3, 1, 3, 1, 2],
  cageOf: [0, 0, 1, 2, 2, 1, 3, 3, 1],
  cages: [
    { id: 0, cells: [0, 1], op: "-", target: 1 },
    { id: 1, cells: [2, 5, 8], op: "*", target: 6 },
    { id: 2, cells: [3, 4], op: "+", target: 5 },
    { id: 3, cells: [6, 7], op: "/", target: 3 },
  ],
};

describe("hint engine", () => {
  it("returns a genuinely forced cell with the correct value", () => {
    // Fill everything except cell 8: its row and column already contain 1 and 3,
    // so the only Latin-legal value is 2 — a naked single.
    const grid = puzzle.solution.slice();
    grid[8] = 0;
    const hint = findHint(puzzle, grid);
    expect(hint).not.toBeNull();
    expect(hint?.index).toBe(8);
    expect(hint?.value).toBe(2);
    expect(hint?.value).toBe(puzzle.solution[8]);
  });

  it("only points at empty cells", () => {
    const grid = puzzle.solution.slice();
    grid[4] = 0;
    grid[5] = 0;
    const hint = findHint(puzzle, grid);
    expect(hint).not.toBeNull();
    expect(grid[hint!.index]).toBe(0);
    expect(hint!.value).toBe(puzzle.solution[hint!.index]);
  });

  it("returns null when the board is already full", () => {
    expect(findHint(puzzle, puzzle.solution)).toBeNull();
  });

  it("always returns correct values that can complete a generated puzzle", () => {
    const generated = generatePuzzle({ size: 5, seed: "hint-solve" });
    const grid = initialGrid(generated);
    let guard = 0;
    while (grid.includes(0) && guard < 200) {
      const hint = findHint(generated, grid);
      expect(hint).not.toBeNull();
      // Every hint must equal the real solution.
      expect(hint!.value).toBe(generated.solution[hint!.index]);
      grid[hint!.index] = hint!.value;
      guard++;
    }
    expect(grid).toEqual(generated.solution);
  });
});
