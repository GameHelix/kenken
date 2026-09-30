import { findHint } from "./hint";
import type { Grid, Puzzle } from "./types";
import { initialGrid, isSolved, lockedCells } from "./validation";

/**
 * The play-session reducer — pure and framework-free, so the whole interaction
 * model (entries, notes, mistakes, hints, undo/redo, win) is testable without a
 * DOM. The component layer only renders this state and dispatches actions.
 *
 * Sound is modelled as data: each action that should be heard bumps `voiceNonce`
 * and sets `voice`, and the component plays it in an effect. That keeps the
 * reducer pure while still driving procedural audio.
 */

export type SoundEvent = "place" | "note" | "erase" | "reject" | "hint" | "win";

interface Snapshot {
  grid: Grid;
  notes: number[][];
}

export interface PlayState {
  puzzle: Puzzle;
  grid: Grid;
  /** Pencil-mark candidates per cell, kept sorted. */
  notes: number[][];
  locked: boolean[];
  selected: number | null;
  notesMode: boolean;
  mistakes: number;
  hints: number;
  status: "playing" | "won";
  past: Snapshot[];
  future: Snapshot[];
  voice: SoundEvent | null;
  voiceNonce: number;
  voiceMag: number;
  flashIndex: number | null;
  flashNonce: number;
}

export type PlayAction =
  | { type: "select"; index: number }
  | { type: "move"; dr: number; dc: number }
  | { type: "digit"; value: number }
  | { type: "erase" }
  | { type: "toggleNotes" }
  | { type: "setNotesMode"; on: boolean }
  | { type: "hint" }
  | { type: "undo" }
  | { type: "redo" };

export function createPlayState(puzzle: Puzzle): PlayState {
  const n = puzzle.size * puzzle.size;
  return {
    puzzle,
    grid: initialGrid(puzzle),
    notes: Array.from({ length: n }, () => [] as number[]),
    locked: lockedCells(puzzle),
    selected: null,
    notesMode: false,
    mistakes: 0,
    hints: 0,
    status: "playing",
    past: [],
    future: [],
    voice: null,
    voiceNonce: 0,
    voiceMag: 1,
    flashIndex: null,
    flashNonce: 0,
  };
}

function snapshot(state: PlayState): Snapshot {
  return { grid: state.grid.slice(), notes: state.notes.map((a) => a.slice()) };
}

function removeFrom(arr: number[], v: number): void {
  const i = arr.indexOf(v);
  if (i >= 0) arr.splice(i, 1);
}

/** Apply a mutation, recording the pre-mutation state for undo and a sound. */
function commit(
  state: PlayState,
  patch: Partial<PlayState>,
  voice: SoundEvent,
  mag: number
): PlayState {
  return {
    ...state,
    ...patch,
    past: [...state.past, snapshot(state)],
    future: [],
    voice,
    voiceNonce: state.voiceNonce + 1,
    voiceMag: mag,
  };
}

export function playReducer(state: PlayState, action: PlayAction): PlayState {
  const size = state.puzzle.size;

  switch (action.type) {
    case "select": {
      if (action.index < 0 || action.index >= state.grid.length) return state;
      if (action.index === state.selected) return state;
      return { ...state, selected: action.index };
    }

    case "move": {
      if (state.selected === null) return { ...state, selected: 0 };
      const r = Math.max(0, Math.min(size - 1, Math.floor(state.selected / size) + action.dr));
      const c = Math.max(0, Math.min(size - 1, (state.selected % size) + action.dc));
      const next = r * size + c;
      return next === state.selected ? state : { ...state, selected: next };
    }

    case "toggleNotes":
      return { ...state, notesMode: !state.notesMode };

    case "setNotesMode":
      return { ...state, notesMode: action.on };

    case "digit": {
      if (state.status !== "playing") return state;
      const i = state.selected;
      if (i === null || state.locked[i]) return state;
      const v = action.value;
      if (v < 1 || v > size) return state;

      if (state.notesMode) {
        if (state.grid[i] !== 0) return state; // never pencil over a committed digit
        const notes = state.notes.map((a) => a.slice());
        const cell = notes[i];
        const at = cell.indexOf(v);
        if (at >= 0) cell.splice(at, 1);
        else {
          cell.push(v);
          cell.sort((a, b) => a - b);
        }
        return commit(state, { notes }, "note", v);
      }

      const grid = state.grid.slice();
      const notes = state.notes.map((a) => a.slice());
      grid[i] = v;
      notes[i] = [];
      // A committed digit clears the same pencil mark from its row and column.
      const r = Math.floor(i / size);
      const c = i % size;
      for (let k = 0; k < size; k++) {
        removeFrom(notes[r * size + k], v);
        removeFrom(notes[k * size + c], v);
      }

      const correct = v === state.puzzle.solution[i];
      let next = commit(
        state,
        { grid, notes, mistakes: correct ? state.mistakes : state.mistakes + 1 },
        correct ? "place" : "reject",
        v
      );
      if (!correct) {
        next = { ...next, flashIndex: i, flashNonce: state.flashNonce + 1 };
      }
      if (isSolved(state.puzzle, grid)) {
        next = {
          ...next,
          status: "won",
          selected: i,
          voice: "win",
          voiceNonce: next.voiceNonce + 1,
        };
      }
      return next;
    }

    case "erase": {
      if (state.status !== "playing") return state;
      const i = state.selected;
      if (i === null || state.locked[i]) return state;
      if (state.grid[i] === 0 && state.notes[i].length === 0) return state;
      const grid = state.grid.slice();
      const notes = state.notes.map((a) => a.slice());
      grid[i] = 0;
      notes[i] = [];
      return commit(state, { grid, notes }, "erase", 1);
    }

    case "hint": {
      if (state.status !== "playing") return state;
      const hint = findHint(state.puzzle, state.grid);
      if (!hint) return state;
      const grid = state.grid.slice();
      const notes = state.notes.map((a) => a.slice());
      grid[hint.index] = hint.value;
      notes[hint.index] = [];
      const r = Math.floor(hint.index / size);
      const c = hint.index % size;
      for (let k = 0; k < size; k++) {
        removeFrom(notes[r * size + k], hint.value);
        removeFrom(notes[k * size + c], hint.value);
      }
      let next = commit(
        state,
        { grid, notes, hints: state.hints + 1, selected: hint.index },
        "hint",
        1
      );
      if (isSolved(state.puzzle, grid)) {
        next = { ...next, status: "won", voice: "win", voiceNonce: next.voiceNonce + 1 };
      }
      return next;
    }

    case "undo": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        grid: prev.grid.slice(),
        notes: prev.notes.map((a) => a.slice()),
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
      };
    }

    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        grid: next.grid.slice(),
        notes: next.notes.map((a) => a.slice()),
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
      };
    }

    default:
      return state;
  }
}

/** mm:ss for the timer and best-time displays. */
export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
