"use client";

import { formatTime } from "@/lib/game/play";

interface WinPanelProps {
  size: number;
  time: number;
  best: number | null;
  isNewBest: boolean;
  mistakes: number;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function WinPanel({
  size,
  time,
  best,
  isNewBest,
  mistakes,
  onPlayAgain,
  onMenu,
}: WinPanelProps) {
  return (
    <div className="kk-overlay" role="dialog" aria-modal aria-label="Puzzle solved">
      <div className="kk-dialog">
        <h2 className="kk-dialog-title">{"✨ Solved!"}</h2>
        <p className="kk-win-time">{formatTime(time)}</p>
        <p className="kk-win-note">
          {`${size}×${size}`} {"·"} {mistakes} mistake{mistakes === 1 ? "" : "s"}
          {isNewBest ? (
            <>
              {" · "}
              <b style={{ color: "var(--kk-good)" }}>New best!</b>
            </>
          ) : typeof best === "number" ? (
            <> {`· best ${formatTime(best)}`}</>
          ) : null}
        </p>
        <button type="button" className="kk-primary" onClick={onPlayAgain}>
          Play again
        </button>
        <button type="button" className="kk-ghost" onClick={onMenu}>
          Back to menu
        </button>
      </div>
    </div>
  );
}
