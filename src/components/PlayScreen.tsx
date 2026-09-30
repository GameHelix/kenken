"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Board } from "./Board";
import { Controls } from "./Controls";
import { Hud } from "./Hud";
import { Keypad } from "./Keypad";
import { useSound } from "@/lib/hooks/useSound";
import { createPlayState, playReducer } from "@/lib/game/play";
import {
  cageLabels,
  computeBorders,
  findCageViolations,
  findConflicts,
} from "@/lib/game/validation";
import type { Puzzle } from "@/lib/game/types";

interface PlayScreenProps {
  puzzle: Puzzle;
  size: number;
  soundOn: boolean;
  paused: boolean;
  onWin: (seconds: number, mistakes: number) => void;
  onNewPuzzle: () => void;
  onExit: () => void;
}

export function PlayScreen({
  puzzle,
  size,
  soundOn,
  paused,
  onWin,
  onNewPuzzle,
  onExit,
}: PlayScreenProps) {
  const [state, dispatch] = useReducer(playReducer, puzzle, createPlayState);
  const [seconds, setSeconds] = useState(0);
  const play = useSound(soundOn);

  const won = state.status === "won";

  // Timer: ticks while playing and not paused behind a dialog. Once solved the
  // interval is cleared, freezing the final time.
  useEffect(() => {
    if (won || paused) return;
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [won, paused]);

  // Sound: play once per event, keyed by a monotonic nonce so toggling the
  // sound switch never replays the last effect.
  const lastVoice = useRef(0);
  useEffect(() => {
    if (state.voiceNonce !== lastVoice.current && state.voice) {
      lastVoice.current = state.voiceNonce;
      play(state.voice, state.voiceMag);
    }
  }, [state.voiceNonce, state.voice, state.voiceMag, play]);

  // Report the win up exactly once; the parent owns best-time persistence and
  // the win panel.
  const reported = useRef(false);
  useEffect(() => {
    if (won && !reported.current) {
      reported.current = true;
      onWin(seconds, state.mistakes);
    }
  }, [won, seconds, state.mistakes, onWin]);

  // Keyboard: arrows move, digits fill, N notes, H hints, Backspace erases,
  // Ctrl/Cmd+Z / Y undo & redo.
  useEffect(() => {
    if (paused || won) return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowUp") {
        e.preventDefault();
        dispatch({ type: "move", dr: -1, dc: 0 });
      } else if (k === "ArrowDown") {
        e.preventDefault();
        dispatch({ type: "move", dr: 1, dc: 0 });
      } else if (k === "ArrowLeft") {
        e.preventDefault();
        dispatch({ type: "move", dr: 0, dc: -1 });
      } else if (k === "ArrowRight") {
        e.preventDefault();
        dispatch({ type: "move", dr: 0, dc: 1 });
      } else if (k === "Backspace" || k === "Delete") {
        e.preventDefault();
        dispatch({ type: "erase" });
      } else if (k === "n" || k === "N") {
        dispatch({ type: "toggleNotes" });
      } else if (k === "h" || k === "H") {
        dispatch({ type: "hint" });
      } else if ((k === "z" || k === "Z") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if ((k === "y" || k === "Y") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (/^[1-9]$/.test(k)) {
        const v = Number(k);
        if (v <= size) dispatch({ type: "digit", value: v });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paused, won, size]);

  const borders = useMemo(() => computeBorders(puzzle), [puzzle]);
  const labels = useMemo(() => cageLabels(puzzle), [puzzle]);
  const conflicts = useMemo(() => findConflicts(state.grid, size), [state.grid, size]);
  const cageBad = useMemo(() => findCageViolations(puzzle, state.grid), [puzzle, state.grid]);

  const onSelect = useCallback((index: number) => dispatch({ type: "select", index }), []);
  const onDigit = useCallback((value: number) => dispatch({ type: "digit", value }), []);

  return (
    <>
      <Hud size={size} seconds={seconds} mistakes={state.mistakes} />

      <Board
        puzzle={puzzle}
        grid={state.grid}
        notes={state.notes}
        locked={state.locked}
        selected={state.selected}
        conflicts={conflicts}
        cageBad={cageBad}
        borders={borders}
        labels={labels}
        flashIndex={state.flashIndex}
        flashNonce={state.flashNonce}
        onSelect={onSelect}
      />

      <Keypad size={size} onDigit={onDigit} disabled={won} />

      <Controls
        notesMode={state.notesMode}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        disabled={won}
        onToggleNotes={() => dispatch({ type: "toggleNotes" })}
        onErase={() => dispatch({ type: "erase" })}
        onHint={() => dispatch({ type: "hint" })}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
      />

      <div className="kk-footer">
        <button type="button" className="kk-ghost" onClick={onNewPuzzle}>
          New puzzle
        </button>
        <button type="button" className="kk-ghost" onClick={onExit}>
          Menu
        </button>
      </div>
    </>
  );
}
