import type { Op } from "./types";

/** Selectable grid sizes. */
export const SIZES = [4, 5, 6, 7] as const;
export type Size = (typeof SIZES)[number];

/** The board the menu opens on. */
export const DEFAULT_SIZE: Size = 6;

/** How each operation is drawn in a cage's clue label. */
export const OP_SYMBOL: Record<Op, string> = {
  "+": "+",
  "-": "−", // minus sign, wider than a hyphen
  "*": "×", // multiplication sign
  "/": "÷", // division sign
};

/** localStorage key holding the best time (seconds) per size. */
export const BEST_TIMES_KEY = "kenken.best.v1";
