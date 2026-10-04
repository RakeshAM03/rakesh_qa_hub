import { describe, expect, it } from "vitest";

import {
  allocateHours,
  computeAreas,
  DEFAULT_SETTINGS,
  focusAreasFor,
  impact,
  likelihood,
  matrixCell,
  mergeSettings,
  planCsv,
  planMarkdown,
  prioritise,
  riskLevel,
  riskScore,
  suggestComplexityBump,
  suggestDefectHistory,
  type AreaInput,
} from "./risk";

const area = (id: string, p: Partial<AreaInput> = {}): AreaInput => ({
  id,
  name: id,
  changeSize: "MEDIUM",
  complexity: 3,
  defectHistory: 3,
  dependencies: 3,
  businessImpact: 3,
  usageFrequency: 3,
  ...p,
});
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

describe("formulas", () => {
  it("likelihood = weighted average (30/25/30/15), one decimal", () => {
    // change LARGE(4)*.3 + 5*.25 + 2*.3 + 1*.15 = 1.2+1.25+0.6+0.15 = 3.2
    expect(likelihood(area("a", { changeSize: "LARGE", complexity: 5, defectHistory: 2, dependencies: 1 }))).toBe(3.2);
    expect(likelihood(area("a", { changeSize: "NONE", complexity: 1, defectHistory: 1, dependencies: 1 }))).toBe(1);
    expect(likelihood(area("a", { changeSize: "NEW_FEATURE", complexity: 5, defectHistory: 5, dependencies: 5 }))).toBe(5);
  });
  it("impact = 70% business impact + 30% usage", () => {
    expect(impact(area("a", { businessImpact: 5, usageFrequency: 2 }))).toBe(4.1);
  });
  it("score = likelihood × impact (1–25)", () => {
    expect(riskScore(area("a", { changeSize: "LARGE", complexity: 5, defectHistory: 2, dependencies: 1, businessImpact: 5, usageFrequency: 2 }))).toBe(13.1);
    expect(riskScore(area("a", { changeSize: "NEW_FEATURE", complexity: 5, defectHistory: 5, dependencies: 5, businessImpact: 5, usageFrequency: 5 }))).toBe(25);
  });
  it("uses custom weights from settings", () => {
    const s = mergeSettings({ likelihoodWeights: { changeSize: 0, complexity: 100, defectHistory: 0, dependencies: 0 } });
    expect(likelihood(area("a", { complexity: 4 }), s)).toBe(4);
    expect(mergeSettings({ thresholds: { critical: "x" } }).thresholds.critical).toBe(16); // malformed → default
  });
});

describe("levels", () => {
  it.each([
    [16, "Critical"],
    [25, "Critical"],
    [15.9, "High"],
    [10, "High"],
    [9.9, "Medium"],
    [5, "Medium"],
    [4.9, "Low"],
    [1, "Low"],
  ])("%s → %s", (score, level) => expect(riskLevel(score)).toBe(level));
});

describe("hour allocation", () => {
  it("splits in proportion to score, rounded to 0.5 h, keeping the total", () => {
    const areas = [area("hi", { businessImpact: 5, usageFrequency: 5, complexity: 5, defectHistory: 5 }), area("mid"), area("lo", { businessImpact: 1, usageFrequency: 1, complexity: 1, defectHistory: 1, changeSize: "SMALL", dependencies: 1 })];
    const h = allocateHours(areas, 20);
    expect(sum(h)).toBe(20);
    for (const v of h.values()) expect(v % 0.5).toBe(0);
    expect(h.get("hi")!).toBeGreaterThan(h.get("mid")!);
    expect(h.get("mid")!).toBeGreaterThan(h.get("lo")!);
  });
  it("gives every area at least 0.5 h", () => {
    const areas = [area("big", { businessImpact: 5, usageFrequency: 5, changeSize: "NEW_FEATURE", complexity: 5, defectHistory: 5, dependencies: 5 }), area("tiny", { businessImpact: 1, usageFrequency: 1, changeSize: "NONE", complexity: 1, defectHistory: 1, dependencies: 1 })];
    const h = allocateHours(areas, 4);
    expect(h.get("tiny")).toBe(0.5);
    expect(h.get("big")).toBe(3.5);
  });
  it("respects overrides and redistributes the rest; deferred areas get nothing", () => {
    const areas = [area("a", { hoursOverride: 6 }), area("b"), area("c"), area("d", { deferred: true })];
    const h = allocateHours(areas, 10);
    expect(h.get("a")).toBe(6);
    expect(h.get("b")! + h.get("c")!).toBe(4);
    expect(h.get("b")).toBe(2);
    expect(h.has("d")).toBe(false);
  });
  it("hands out minimums even when hours run out (over capacity)", () => {
    const h = allocateHours([area("a", { hoursOverride: 10 }), area("b"), area("c")], 8);
    expect(h.get("b")).toBe(0.5);
    expect(h.get("c")).toBe(0.5);
  });
});

describe("prioritised plan and matrix", () => {
  const areas = computeAreas(
    [
      area("Search", { businessImpact: 2, usageFrequency: 3 }),
      area("Checkout payment", { changeSize: "LARGE", complexity: 5, defectHistory: 4, dependencies: 5, businessImpact: 5, usageFrequency: 5 }),
      area("Profile", { changeSize: "SMALL", complexity: 2, defectHistory: 1, dependencies: 1, businessImpact: 2, usageFrequency: 2 }),
      area("Legacy export", { deferred: true, deferReason: "Not changed this sprint" }),
    ],
    16,
  );
  it("orders Critical first, then by score; deferred listed separately", () => {
    const { active, deferred } = prioritise(areas);
    expect(active.map((a) => [a.name, a.level])).toEqual([
      ["Checkout payment", "Critical"],
      ["Search", "Medium"],
      ["Profile", "Low"],
    ]);
    expect(deferred.map((a) => a.name)).toEqual(["Legacy export"]);
    expect(active[0].depth).toBe(DEFAULT_SETTINGS.depth.Critical);
  });
  it("places areas on the 5×5 matrix", () => {
    const pay = areas.find((a) => a.name === "Checkout payment")!;
    expect(pay.likelihood).toBe(4.4);
    expect(matrixCell(pay)).toEqual({ x: 5, y: 4 });
  });
  it("maps top factors to PR QA Session focus areas", () => {
    expect(focusAreasFor(areas.find((a) => a.name === "Checkout payment")!)).toEqual(["Contract Testing", "UI / UX", "Security", "Performance", "Regression"]);
    expect(focusAreasFor(areas.find((a) => a.name === "Profile")!)).toEqual(["Regression"]);
  });
  it("exports Markdown with accepted risks, and CSV", () => {
    const md = planMarkdown({ name: "Sprint 42", availableHours: 16 }, areas);
    expect(md).toContain("### Test plan — Sprint 42");
    expect(md).toContain("| 1 | Checkout payment | Critical |");
    expect(md).toContain("- Legacy export (Medium, score 9) — Not changed this sprint");
    const csv = planCsv(areas).split("\n");
    expect(csv[0]).toMatch(/^Rank,Area,Change size/);
    expect(csv[1]).toMatch(/^1,Checkout payment,Large,5,4,5,5,5,/);
    expect(csv[4]).toMatch(/^,Legacy export,.*,yes,Not changed this sprint$/);
  });
  it("escapes CSV formula injection", () => {
    expect(planCsv(computeAreas([area("=HYPERLINK(1)")], 1)).split("\n")[1]).toContain(`"'=HYPERLINK(1)"`);
  });
});

describe("suggestions", () => {
  const now = Date.parse("2026-10-04T00:00:00Z");
  const iss = (n: number, p: Partial<{ severity: "P0" | "P1" | "P2"; isValid: boolean; daysAgo: number }> = {}) =>
    Array.from({ length: n }, () => ({ severity: p.severity ?? "P2", isValid: p.isValid ?? true, createdAt: new Date(now - (p.daysAgo ?? 5) * 86_400_000) }));
  it.each([
    [[], 1],
    [iss(3), 2],
    [iss(4), 3],
    [iss(8), 3],
    [iss(9), 4],
    [iss(16), 5],
    [[...iss(2), ...iss(2, { severity: "P0" })], 3], // 4 issues, 2 severe → 6
    [iss(10, { daysAgo: 120 }), 1], // too old
    [iss(5, { isValid: false }), 1], // invalid don't count
  ])("defect history %#", (issues, value) => expect(suggestDefectHistory(issues as never, now).value).toBe(value));
  it("explains the suggestion", () => {
    expect(suggestDefectHistory([...iss(2), ...iss(1, { severity: "P1" }), ...iss(1, { isValid: false })], now).reason).toBe("4 issues in the last 90 days (75% valid, 1 P0/P1 counted twice) → weighted 4");
  });
  it("bumps complexity by one when there are P0/P1 flags", () => {
    expect(suggestComplexityBump(3, 2)).toEqual({ value: 4, reason: "2 P0/P1 AI PR Review flags in the last 30 days on the plan's repos" });
    expect(suggestComplexityBump(5, 1)?.value).toBe(5);
    expect(suggestComplexityBump(3, 0)).toBeNull();
  });
});
