import { describe, expect, it } from "vitest";
import { cageSatisfied, cageStillPossible, combineFull } from "@/lib/game/cages";
import type { Cage } from "@/lib/game/types";

describe("cage arithmetic", () => {
  it("combines each operation correctly", () => {
    expect(combineFull("+", [1, 2, 3])).toBe(6);
    expect(combineFull("*", [2, 3, 4])).toBe(24);
    expect(combineFull("-", [2, 5])).toBe(3); // |2 - 5|
    expect(combineFull("-", [5, 2])).toBe(3); // order-independent
    expect(combineFull("/", [6, 2])).toBe(3); // max / min
    expect(combineFull("/", [2, 6])).toBe(3);
  });

  it("satisfies a cage only when the target is met exactly", () => {
    const plus: Cage = { id: 0, cells: [0, 1, 2], op: "+", target: 6 };
    expect(cageSatisfied(plus, [1, 2, 3])).toBe(true);
    expect(cageSatisfied(plus, [1, 2, 4])).toBe(false);

    const times: Cage = { id: 1, cells: [0, 1], op: "*", target: 12 };
    expect(cageSatisfied(times, [3, 4])).toBe(true);
    expect(cageSatisfied(times, [2, 4])).toBe(false);

    const minus: Cage = { id: 2, cells: [0, 1], op: "-", target: 3 };
    expect(cageSatisfied(minus, [5, 2])).toBe(true);
    expect(cageSatisfied(minus, [5, 3])).toBe(false);

    const div: Cage = { id: 3, cells: [0, 1], op: "/", target: 2 };
    expect(cageSatisfied(div, [6, 3])).toBe(true);
    expect(cageSatisfied(div, [6, 4])).toBe(false);

    const given: Cage = { id: 4, cells: [0], op: null, target: 4 };
    expect(cageSatisfied(given, [4])).toBe(true);
    expect(cageSatisfied(given, [3])).toBe(false);
  });

  it("treats an unfilled cage as not yet satisfied", () => {
    const plus: Cage = { id: 0, cells: [0, 1, 2], op: "+", target: 6 };
    expect(cageSatisfied(plus, [1, 2, 0])).toBe(false);
  });

  it("prunes impossible partial cages but keeps feasible ones", () => {
    const size = 6;
    // 3-cell sum of 6: partial [1, 2] needs a 3 (feasible).
    const plus: Cage = { id: 0, cells: [0, 1, 2], op: "+", target: 6 };
    expect(cageStillPossible(plus, [1, 2, 0], size)).toBe(true);
    // partial [5, 4] already exceeds 6 with a cell left — impossible.
    expect(cageStillPossible(plus, [5, 4, 0], size)).toBe(false);

    // product cage: partial product must divide the target.
    const times: Cage = { id: 1, cells: [0, 1], op: "*", target: 12 };
    expect(cageStillPossible(times, [3, 0], size)).toBe(true);
    expect(cageStillPossible(times, [5, 0], size)).toBe(false); // 5 does not divide 12
  });
});
