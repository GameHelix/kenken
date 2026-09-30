"use client";

import { cx } from "@/lib/cx";

interface ControlsProps {
  notesMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  onToggleNotes: () => void;
  onErase: () => void;
  onHint: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function Controls({
  notesMode,
  canUndo,
  canRedo,
  disabled,
  onToggleNotes,
  onErase,
  onHint,
  onUndo,
  onRedo,
}: ControlsProps) {
  return (
    <div className="kk-actions">
      <button
        type="button"
        className={cx("kk-btn", notesMode && "is-on")}
        onClick={onToggleNotes}
        disabled={disabled}
        aria-pressed={notesMode}
      >
        <span className="kk-btn-glyph" aria-hidden>
          {"✎"}
        </span>
        Notes
      </button>
      <button type="button" className="kk-btn" onClick={onErase} disabled={disabled}>
        <span className="kk-btn-glyph" aria-hidden>
          {"⌫"}
        </span>
        Erase
      </button>
      <button type="button" className="kk-btn" onClick={onHint} disabled={disabled}>
        <span className="kk-btn-glyph" aria-hidden>
          {"✦"}
        </span>
        Hint
      </button>
      <button
        type="button"
        className="kk-btn"
        onClick={onUndo}
        disabled={disabled || !canUndo}
      >
        <span className="kk-btn-glyph" aria-hidden>
          {"↶"}
        </span>
        Undo
      </button>
      <button
        type="button"
        className="kk-btn"
        onClick={onRedo}
        disabled={disabled || !canRedo}
      >
        <span className="kk-btn-glyph" aria-hidden>
          {"↷"}
        </span>
        Redo
      </button>
    </div>
  );
}
