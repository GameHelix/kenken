"use client";

import type { CSSProperties } from "react";

interface KeypadProps {
  size: number;
  onDigit: (value: number) => void;
  disabled?: boolean;
}

export function Keypad({ size, onDigit, disabled }: KeypadProps) {
  return (
    <div className="kk-keypad" style={{ "--pad": size } as CSSProperties}>
      {Array.from({ length: size }, (_, k) => k + 1).map((d) => (
        <button
          key={d}
          type="button"
          className="kk-key"
          onClick={() => onDigit(d)}
          disabled={disabled}
          aria-label={`Enter ${d}`}
        >
          {d}
        </button>
      ))}
    </div>
  );
}
