import { describe, expect, it } from "vitest";
import { generatePuzzle } from "@/lib/game/generator";
import { cageSatisfied } from "@/lib/game/cages";
import { countSolutions } from "@/lib/game/solver";
import { isSolved } from "@/lib/game/validation";
import type { Cage } from "@/lib/game/types";

function isContiguous(cells: number[], size: number): boolean {
  const set = new Set(cells);
  const seen = new Set<number>([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop() as number;
    const r = Math.floor(i / size);
    const c = i % size;
    const nbs = [
      r > 0 ? i - size : -1,
      r < size - 1 ? i + size : -1,
      c > 0 ? i - 1 : -1,
      c < size - 1 ? i + 1 : -1,
    ];
    for (const nb of nbs) {
      if (nb >= 0 && set.has(nb) && !seen.has(nb)) {
        seen.add(nb);
        stack.push(nb);
      }
    }
  }
  return seen.size === cells.length;
}

const SIZES = [4, 5, 6, 7] as const;

describe("puzzle generator", () => {
  for (const size of SIZES) {
    describe(`${size}×${size}`, () => {
      const puzzle = generatePuzzle({ size, seed: `gen-${size}` });

      it("has exactly one solution", () => {
        expect(countSolutions(puzzle, 2)).toBe(1);
      });

      it("is satisfied by its own solution", () => {
        expect(isSolved(puzzle, puzzle.solution)).toBe(true);
      });

      it("partitions the grid into contiguous cages", () => {
        const covered = new Array<number>(size * size).fill(0);
        for (const cage of puzzle.cages) {
          expect(cage.cells.length).toBeGreaterThan(0);
          expect(isContiguous(cage.cells, size)).toBe(true);
          for (const cell of cage.cells) covered[cell]++;
        }
        expect(covered.every((n) => n === 1)).toBe(true);
      });

      it("keeps cageOf consistent with the cages", () => {
        for (const cage of puzzle.cages) {
          for (const cell of cage.cells) expect(puzzle.cageOf[cell]).toBe(cage.id);
        }
      });

      it("gives every cage arithmetic that matches the solution", () => {
        for (const cage of puzzle.cages) {
          expect(cageSatisfied(cage, puzzle.solution)).toBe(true);
          if (cage.op === null) {
            expect(cage.cells).toHaveLength(1);
            expect(cage.target).toBe(puzzle.solution[cage.cells[0]]);
          }
          // − and ÷ are only assigned to two-cell cages.
          if (cage.op === "-" || cage.op === "/") {
            expect(cage.cells).toHaveLength(2);
          }
        }
      });

      it("uses a mix of operations (not only givens)", () => {
        const ops = new Set<Cage["op"]>(puzzle.cages.map((c) => c.op));
        // At least one real arithmetic cage must exist.
        expect([...ops].some((op) => op !== null)).toBe(true);
      });
    });
  }

  it("is reproducible from a seed", () => {
    const a = generatePuzzle({ size: 5, seed: "repro" });
    const b = generatePuzzle({ size: 5, seed: "repro" });
    expect(a.solution).toEqual(b.solution);
    expect(a.cageOf).toEqual(b.cageOf);
  });

  it("generates quickly for the largest size", () => {
    const start = Date.now();
    generatePuzzle({ size: 7, seed: "speed" });
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
