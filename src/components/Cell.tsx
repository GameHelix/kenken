"use client";

import { memo } from "react";
import { cx } from "@/lib/cx";
import type { CellBorders } from "@/lib/game/validation";

export interface CellProps {
  index: number;
  size: number;
  value: number;
  notes: number[];
  clue: string | null;
  borders: CellBorders;
  locked: boolean;
  selected: boolean;
  peer: boolean;
  sameValue: boolean;
  conflict: boolean;
  cageBad: boolean;
  flash: boolean;
  onSelect: (index: number) => void;
}

function CellComponent({
  index,
  size,
  value,
  notes,
  clue,
  borders,
  locked,
  selected,
  peer,
  sameValue,
  conflict,
  cageBad,
  flash,
  onSelect,
}: CellProps) {
  const className = cx(
    "kk-cell",
    selected && "is-selected",
    !selected && peer && "is-peer",
    !selected && sameValue && "is-sameval",
    locked && "is-locked",
    conflict && "is-conflict",
    cageBad && "is-cagebad",
    flash && "is-flash"
  );

  const row = Math.floor(index / size) + 1;
  const col = (index % size) + 1;
  const label = `Row ${row}, column ${col}${value ? `, value ${value}` : ", empty"}`;

  return (
    <button
      type="button"
      tabIndex={-1}
      className={className}
      style={{
        borderTop: borders.top,
        borderRight: borders.right,
        borderBottom: borders.bottom,
        borderLeft: borders.left,
      }}
      onClick={() => onSelect(index)}
      aria-label={label}
      aria-pressed={selected}
    >
      {clue ? <span className="kk-clue">{clue}</span> : null}
      {value !== 0 ? (
        <span className={cx("kk-value", !locked && "is-user", conflict && "is-conflict")}>
          {value}
        </span>
      ) : notes.length > 0 ? (
        <span className="kk-notes" aria-hidden>
          {Array.from({ length: size }, (_, k) => k + 1).map((d) => (
            <span key={d} className="kk-note">
              {notes.includes(d) ? d : ""}
            </span>
          ))}
        </span>
      ) : null}
    </button>
  );
}

export const Cell = memo(CellComponent);
