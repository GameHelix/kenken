"use client";

import { useCallback, useState, type CSSProperties } from "react";
import { MenuScreen } from "./MenuScreen";
import { PlayScreen } from "./PlayScreen";
import { RulesPanel } from "./RulesPanel";
import { WinPanel } from "./WinPanel";
import { BEST_TIMES_KEY, DEFAULT_SIZE, type Size } from "@/lib/game/constants";
import { generatePuzzle } from "@/lib/game/generator";
import { useLocalStorage } from "@/lib/hooks/useLocalStorage";
import type { Puzzle } from "@/lib/game/types";

interface ActiveGame {
  puzzle: Puzzle;
  /** Bumped on every new puzzle so PlayScreen remounts with a clean state. */
  nonce: number;
}

interface WinResult {
  size: Size;
  time: number;
  best: number;
  isNewBest: boolean;
  mistakes: number;
}

/**
 * Top-level orchestrator: routes between the menu and a play session, owns the
 * persisted best times, the sound switch, the rules dialog and the win panel.
 * Puzzles are only generated in response to a user action, so nothing random
 * runs during SSR and the first paint always matches the server markup.
 */
export function KenKenGame() {
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [game, setGame] = useState<ActiveGame | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [win, setWin] = useState<WinResult | null>(null);
  const { value: bestTimes, store: storeBestTimes } = useLocalStorage<Record<string, number>>(
    BEST_TIMES_KEY,
    {}
  );

  const startPuzzle = useCallback((s: Size) => {
    setWin(null);
    setGame((prev) => ({ puzzle: generatePuzzle({ size: s }), nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  const handleStart = useCallback(() => startPuzzle(size), [size, startPuzzle]);

  const handleExit = useCallback(() => {
    setWin(null);
    setGame(null);
  }, []);

  const handleWin = useCallback(
    (seconds: number, mistakes: number) => {
      const key = String(size);
      const prev = bestTimes[key];
      const isNewBest = prev === undefined || seconds < prev;
      if (isNewBest) storeBestTimes({ ...bestTimes, [key]: seconds });
      setWin({
        size,
        time: seconds,
        best: isNewBest ? seconds : (prev ?? seconds),
        isNewBest,
        mistakes,
      });
    },
    [size, bestTimes, storeBestTimes]
  );

  return (
    <main className="kk-app" style={{ "--n": size } as CSSProperties}>
      {game ? (
        <PlayScreen
          key={game.nonce}
          puzzle={game.puzzle}
          size={size}
          soundOn={soundOn}
          paused={rulesOpen || win !== null}
          onWin={handleWin}
          onNewPuzzle={handleStart}
          onExit={handleExit}
        />
      ) : (
        <MenuScreen
          size={size}
          bestTimes={bestTimes}
          soundOn={soundOn}
          onSize={setSize}
          onStart={handleStart}
          onRules={() => setRulesOpen(true)}
          onToggleSound={() => setSoundOn((v) => !v)}
        />
      )}

      {win ? (
        <WinPanel
          size={win.size}
          time={win.time}
          best={win.best}
          isNewBest={win.isNewBest}
          mistakes={win.mistakes}
          onPlayAgain={handleStart}
          onMenu={handleExit}
        />
      ) : null}

      {rulesOpen ? <RulesPanel onClose={() => setRulesOpen(false)} /> : null}
    </main>
  );
}
