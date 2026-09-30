"use client";

interface RulesPanelProps {
  onClose: () => void;
}

export function RulesPanel({ onClose }: RulesPanelProps) {
  return (
    <div className="kk-overlay" role="dialog" aria-modal aria-label="How to play">
      <div className="kk-dialog">
        <h2 className="kk-dialog-title">How to play</h2>
        <div className="kk-rules">
          <p>
            Fill the grid so every row and every column contains each digit from{" "}
            <b>1 to N</b> exactly once.
          </p>
          <p>
            The board is split into <b>cages</b> outlined in bold. Each cage shows a
            target and an operation. Its cells must combine to the target:
          </p>
          <p>
            <b>+</b> add &nbsp; <b>{"×"}</b> multiply &nbsp; <b>{"−"}</b>{" "}
            difference (two cells) &nbsp; <b>{"÷"}</b> quotient (two cells).
          </p>
          <p>
            A cage with just a number and no sign is a <b>given</b> — that single value
            is fixed for you.
          </p>
          <p>
            Type a digit or tap the pad to fill the selected cell. Use <b>Notes</b> to
            pencil in candidates, <b>Hint</b> to reveal one forced cell, and{" "}
            <b>Undo / Redo</b> freely. Arrow keys move, <b>N</b> toggles notes,{" "}
            <b>H</b> hints, <b>Backspace</b> erases.
          </p>
        </div>
        <button type="button" className="kk-primary" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
