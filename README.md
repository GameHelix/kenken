# ✖️ KENKEN

A neon **KenKen** (also called Calcudoku or MathDoku) — an arithmetic Latin-square puzzle. Fill an N×N grid so every row and column holds `1..N` exactly once, while each outlined **cage** combines its cells to a target using `+`, `−`, `×` or `÷`. Built with **Next.js 16**, **TypeScript** (strict) and **Tailwind CSS v4**; every board is produced from a seed and verified to have a single unique solution, so it always yields to logic and never to a guess.

## ✨ Features

| | |
| --- | --- |
| 🔢 Four sizes | 4×4, 5×5, 6×6 (default) and 7×7, with difficulty rising as the grid grows |
| 🧩 Real cages | Contiguous cages with bold outlines, corner clue labels, and `+ − × ÷` targets |
| 🎯 Unique solutions | A backtracking solver verifies one — and only one — answer for every puzzle |
| ✏️ Pencil notes | Toggle candidate marks per cell, cleared automatically as you commit digits |
| 💡 Forced hint | Reveals one genuinely deducible cell, never a guess |
| ↩️ Undo / redo | Full history, plus a live mistake counter and cage-violation highlighting |
| ⏱️ Best times | Per-size records saved locally and shared across tabs |
| ⌨️ Keyboard + touch | Arrow-key navigation and an on-screen number pad for phones |
| 🔊 Procedural audio | Web Audio blips for place, note, erase, reject, hint and win — no asset files |
| 🌗 Reduced motion | Honors `prefers-reduced-motion`, responsive with no horizontal scroll |

## 🎮 How to play

1. Pick a grid size and start a puzzle.
2. Select a cell, then type a digit or tap the pad to fill it.
3. Keep each digit `1..N` unique within its row and column.
4. Make each cage reach its target: `+` sum, `×` product (any size), `−` difference and `÷` quotient (two cells). A lone number with no sign is a **given**.
5. Use **Notes** to pencil candidates, **Hint** for a forced cell, and **Undo / Redo** freely. Solve the whole grid to win.

**Keys:** arrows move · `1`–`9` fill · `N` notes · `H` hint · `Backspace` erase · `Ctrl/⌘ + Z` undo · `Ctrl/⌘ + Y` redo.

## 🛠 Tech

- **Next.js 16** (App Router) + **React 19**
- **TypeScript 5**, strict mode
- **Tailwind CSS v4** via `@tailwindcss/postcss`
- **Vitest 3** for the core-logic unit tests
- Pure, framework-free game engine (rng, Latin-square generator, solver, cage validation, hint) under `src/lib/game`

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
```

```bash
npm run build    # production build
npm test         # run the unit tests
npm run lint     # lint the project
```
