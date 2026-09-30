"use client";

import { memo, type CSSProperties } from "react";
import { Cell } from "./Cell";
import type { CellBorders } from "@/lib/game/validation";
import type { Grid, Puzzle } from "@/lib/game/types";

interface BoardProps {
  puzzle: Puzzle;
  grid: Grid;
  notes: number[][];
  locked: boolean[];
  selected: number | null;
  conflicts: Set<number>;
  cageBad: Set<number>;
  borders: CellBorders[];
  labels: (string | null)[];
  flashIndex: number | null;
  flashNonce: number;
  onSelect: (index: number) => void;
}

function BoardComponent({
  puzzle,
  grid,
  notes,
  locked,
  selected,
  conflicts,
  cageBad,
  borders,
  labels,
  flashIndex,
  flashNonce,
  onSelect,
}: BoardProps) {
  const { size } = puzzle;
  const selRow = selected === null ? -1 : Math.floor(selected / size);
  const selCol = selected === null ? -1 : selected % size;
  const selValue = selected === null ? 0 : grid[selected];

  return (
    <div
      className="kk-board"
      style={{ "--n": size } as CSSProperties}
      role="grid"
      aria-label={`${size} by ${size} KenKen board`}
    >
      {grid.map((value, i) => {
        const r = Math.floor(i / size);
        const c = i % size;
        const peer = selected !== null && (r === selRow || c === selCol);
        const sameValue = selValue !== 0 && value === selValue;
        const isFlash = i === flashIndex;
        return (
          <Cell
            key={isFlash ? `${i}:${flashNonce}` : i}
            index={i}
            size={size}
            value={value}
            notes={notes[i]}
            clue={labels[i]}
            borders={borders[i]}
            locked={locked[i]}
            selected={selected === i}
            peer={peer}
            sameValue={sameValue}
            conflict={conflicts.has(i)}
            cageBad={cageBad.has(i)}
            flash={isFlash}
            onSelect={onSelect}
          />
        );
      })}
    </div>
  );
}

export const Board = memo(BoardComponent);
