"use client";

import { cx } from "@/lib/cx";
import { SIZES, type Size } from "@/lib/game/constants";
import { formatTime } from "@/lib/game/play";

interface MenuScreenProps {
  size: Size;
  bestTimes: Record<string, number>;
  soundOn: boolean;
  onSize: (size: Size) => void;
  onStart: () => void;
  onRules: () => void;
  onToggleSound: () => void;
}

export function MenuScreen({
  size,
  bestTimes,
  soundOn,
  onSize,
  onStart,
  onRules,
  onToggleSound,
}: MenuScreenProps) {
  return (
    <>
      <h1 className="kk-title">{"✖️ KENKEN"}</h1>
      <p className="kk-subtitle">Arithmetic Latin squares. One solution, no guessing.</p>

      <div className="kk-card">
        <span className="kk-field-label">Grid size</span>
        <div className="kk-size-row">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              className={cx("kk-size", s === size && "is-on")}
              onClick={() => onSize(s)}
              aria-pressed={s === size}
            >
              {`${s}×${s}`}
            </button>
          ))}
        </div>

        <button type="button" className="kk-primary" onClick={onStart}>
          Start puzzle
        </button>

        <div className="kk-best-grid">
          {SIZES.map((s) => {
            const best = bestTimes[String(s)];
            return (
              <div key={s} className="kk-best">
                <span className="kk-best-size">{`${s}×${s}`}</span>
                <span className="kk-best-time">
                  {typeof best === "number" ? formatTime(best) : "—"}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="kk-ghost" style={{ flex: 1 }} onClick={onRules}>
            How to play
          </button>
          <button
            type="button"
            className={cx("kk-ghost")}
            style={{ flex: 1 }}
            onClick={onToggleSound}
            aria-pressed={soundOn}
          >
            {soundOn ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
        </div>
      </div>
    </>
  );
}
