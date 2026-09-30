"use client";

import { cx } from "@/lib/cx";
import { formatTime } from "@/lib/game/play";

interface HudProps {
  size: number;
  seconds: number;
  mistakes: number;
}

export function Hud({ size, seconds, mistakes }: HudProps) {
  return (
    <div className="kk-hud">
      <div className="kk-stat">
        <span className="kk-stat-label">Time</span>
        <span className="kk-stat-value">{formatTime(seconds)}</span>
      </div>
      <div className="kk-stat">
        <span className="kk-stat-label">Grid</span>
        <span className="kk-stat-value">{`${size}×${size}`}</span>
      </div>
      <div className="kk-stat">
        <span className="kk-stat-label">Mistakes</span>
        <span className={cx("kk-stat-value", mistakes > 0 && "is-alert")}>{mistakes}</span>
      </div>
    </div>
  );
}
