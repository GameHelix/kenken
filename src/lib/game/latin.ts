import type { Rng } from "./rng";

/**
 * A random completed Latin square via randomized backtracking: fill cells in
 * order, trying digits in a shuffled sequence, so each run yields a different
 * valid square. For N ≤ 7 this settles instantly.
 */
export function generateLatinSquare(size: number, rng: Rng): number[] {
  const grid = new Array<number>(size * size).fill(0);
  const rowUsed = Array.from({ length: size }, () => new Array<boolean>(size + 1).fill(false));
  const colUsed = Array.from({ length: size }, () => new Array<boolean>(size + 1).fill(false));
  const digits = Array.from({ length: size }, (_, i) => i + 1);

  function place(pos: number): boolean {
    if (pos === size * size) return true;
    const r = Math.floor(pos / size);
    const c = pos % size;
    const order = rng.shuffle(digits.slice());
    for (const v of order) {
      if (rowUsed[r][v] || colUsed[c][v]) continue;
      grid[pos] = v;
      rowUsed[r][v] = true;
      colUsed[c][v] = true;
      if (place(pos + 1)) return true;
      grid[pos] = 0;
      rowUsed[r][v] = false;
      colUsed[c][v] = false;
    }
    return false;
  }

  place(0);
  return grid;
}
