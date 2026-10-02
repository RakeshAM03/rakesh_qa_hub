import { describe, expect, it } from "vitest";

import { insertBySeverity, moveItem, severityCounts } from "./list";
import type { Bug, Severity } from "./types";

const bug = (id: string, severity: Severity): Bug => ({
  id, title: id, severity, steps: [], source: "MANUAL", createdAt: "",
});
const ids = (list: Bug[]) => list.map((b) => b.id);

describe("insertBySeverity", () => {
  it("sorts by severity, then by order added", () => {
    let list: Bug[] = [];
    list = insertBySeverity(list, [bug("a", "P2"), bug("b", "P0"), bug("c", "P2"), bug("d", "P1")]);
    expect(ids(list)).toEqual(["b", "d", "a", "c"]);
  });
});

describe("moveItem", () => {
  it("moves an item and ignores out-of-range moves", () => {
    expect(moveItem([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
    expect(moveItem([1, 2, 3], 0, 5)).toEqual([1, 2, 3]);
  });
});

describe("severityCounts", () => {
  it("counts each severity", () => {
    expect(severityCounts([bug("a", "P1"), bug("b", "P1"), bug("c", "P3")])).toEqual({ P0: 0, P1: 2, P2: 0, P3: 1 });
  });
});
