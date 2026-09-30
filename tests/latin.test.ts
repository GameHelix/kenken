import { describe, expect, it } from "vitest";
import { generateLatinSquare } from "@/lib/game/latin";
import { makeRng } from "@/lib/game/rng";

function isLatin(grid: number[], size: number): boolean {
  for (let r = 0; r < size; r++) {
    const row = new Set<number>();
    const col = new Set<number>();
    for (let c = 0; c < size; c++) {
      row.add(grid[r * size + c]);
      col.add(grid[c * size + r]);
    }
    if (row.size !== size || col.size !== size) return false;
  }
  return grid.every((v) => v >= 1 && v <= size);
}

describe("Latin square generator", () => {
  it("produces a valid Latin square for every size", () => {
    for (const size of [4, 5, 6, 7]) {
      const grid = generateLatinSquare(size, makeRng(`latin-${size}`));
      expect(grid).toHaveLength(size * size);
      expect(isLatin(grid, size)).toBe(true);
    }
  });

  it("is reproducible from the same seed", () => {
    const a = generateLatinSquare(6, makeRng("seed"));
    const b = generateLatinSquare(6, makeRng("seed"));
    expect(a).toEqual(b);
  });
});
