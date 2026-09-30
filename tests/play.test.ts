import { describe, expect, it } from "vitest";
import { createPlayState, formatTime, playReducer, type PlayState } from "@/lib/game/play";
import type { Puzzle } from "@/lib/game/types";

// The verified unique 3×3 board (given at cell 0 = 1).
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

function place(state: PlayState, index: number, value: number): PlayState {
  return playReducer(playReducer(state, { type: "select", index }), { type: "digit", value });
}

describe("play reducer", () => {
  it("pre-fills and locks the single-cell given", () => {
    const s = createPlayState(puzzle);
    expect(s.grid[0]).toBe(1);
    expect(s.locked[0]).toBe(true);
    expect(s.grid.slice(1).every((v) => v === 0)).toBe(true);
  });

  it("wins when the final correct digit lands, with no mistakes", () => {
    let s = createPlayState(puzzle);
    for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) {
      s = place(s, i, puzzle.solution[i]);
    }
    expect(s.status).toBe("won");
    expect(s.mistakes).toBe(0);
    expect(s.voice).toBe("win");
  });

  it("counts a mistake and raises a reject flash for a wrong digit", () => {
    let s = createPlayState(puzzle);
    s = place(s, 1, 3); // cell 1 should be 2
    expect(s.grid[1]).toBe(3);
    expect(s.mistakes).toBe(1);
    expect(s.voice).toBe("reject");
    expect(s.flashIndex).toBe(1);
  });

  it("ignores edits to a given cell", () => {
    const start = playReducer(createPlayState(puzzle), { type: "select", index: 0 });
    const after = playReducer(start, { type: "digit", value: 2 });
    expect(after.grid[0]).toBe(1);
    expect(after).toBe(start); // no-op returns the same reference
  });

  it("toggles pencil notes on and off", () => {
    let s = createPlayState(puzzle);
    s = playReducer(s, { type: "select", index: 4 });
    s = playReducer(s, { type: "setNotesMode", on: true });
    s = playReducer(s, { type: "digit", value: 1 });
    s = playReducer(s, { type: "digit", value: 3 });
    expect(s.notes[4]).toEqual([1, 3]);
    expect(s.voice).toBe("note");
    s = playReducer(s, { type: "digit", value: 1 }); // toggle 1 back off
    expect(s.notes[4]).toEqual([3]);
  });

  it("clears the same pencil mark from row and column on a commit", () => {
    let s = createPlayState(puzzle);
    // Note a 2 in cells 4 and 7 (same column as cell 1).
    s = playReducer(s, { type: "select", index: 4 });
    s = playReducer(s, { type: "setNotesMode", on: true });
    s = playReducer(s, { type: "digit", value: 2 });
    s = playReducer(s, { type: "setNotesMode", on: false });
    // Commit a 2 into cell 1 (column 1) — it should erase the note in cell 4.
    s = place(s, 1, 2);
    expect(s.notes[4]).toEqual([]);
  });

  it("undoes and redoes an entry", () => {
    let s = place(createPlayState(puzzle), 1, 2);
    expect(s.grid[1]).toBe(2);
    s = playReducer(s, { type: "undo" });
    expect(s.grid[1]).toBe(0);
    s = playReducer(s, { type: "redo" });
    expect(s.grid[1]).toBe(2);
  });

  it("fills a correct cell on hint", () => {
    const init = createPlayState(puzzle);
    const s = playReducer(init, { type: "hint" });
    expect(s.hints).toBe(1);
    expect(s.voice).toBe("hint");
    const idx = s.grid.findIndex((v, i) => v !== init.grid[i]);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(s.grid[idx]).toBe(puzzle.solution[idx]);
  });

  it("moves the selection with clamping at the edges", () => {
    let s = createPlayState(puzzle);
    s = playReducer(s, { type: "select", index: 0 });
    s = playReducer(s, { type: "move", dr: -1, dc: -1 }); // already top-left
    expect(s.selected).toBe(0);
    s = playReducer(s, { type: "move", dr: 1, dc: 1 });
    expect(s.selected).toBe(4); // one down, one right on a 3-wide grid
  });
});

describe("formatTime", () => {
  it("renders mm:ss", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(65)).toBe("1:05");
    expect(formatTime(600)).toBe("10:00");
  });
});
