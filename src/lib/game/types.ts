/**
 * Core KenKen types — pure data, no React, no DOM.
 *
 * A board is a Latin square of side `size`; cells are addressed by a single
 * index `row * size + col`. The grid is partitioned into cages, each carrying an
 * arithmetic clue that the player must satisfy without ever repeating a digit in
 * a row or column.
 */

/** The four cage operations. Single-cell "given" cages carry `null` instead. */
export type Op = "+" | "-" | "*" | "/";

export interface Cage {
  /** Stable identifier, unique within a puzzle. */
  id: number;
  /** Member cell indices, kept sorted ascending (so `cells[0]` is the top-left). */
  cells: number[];
  /** `null` marks a single-cell given whose `target` is simply its value. */
  op: Op | null;
  /** The clue's target number. */
  target: number;
}

export interface Puzzle {
  /** Side length N; the grid is N×N and digits run 1..N. */
  size: number;
  cages: Cage[];
  /** For every cell index, the id of the cage it belongs to. */
  cageOf: number[];
  /** The unique completed solution, values 1..N. */
  solution: number[];
}

/** A working board. `0` marks an empty cell. */
export type Grid = number[];
