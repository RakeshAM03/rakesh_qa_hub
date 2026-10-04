import { describe, expect, it } from "vitest";

import {
  coverageOverTime,
  monthlySeries,
  monthsOf,
  overallCoverage,
  passRateByWeek,
  periodDays,
  periodMonths,
  presetPeriod,
  previousPeriod,
  projectMetrics,
  roiPercent,
  rowsCsv,
  summarize,
  summaryText,
  type CiRun,
  type Project,
} from "./roi";

const project = (p: Partial<Project> = {}): Project => ({
  id: "p1",
  name: "Checkout regression",
  totalTests: 240,
  automatedTests: 180,
  manualMinutesPerTest: 6,
  automatedSecondsPerTest: 20,
  runsPerMonth: 40,
  buildHours: 120,
  maintenanceHoursPerMonth: 8,
  ...p,
});
const run = (date: string, conclusion = "success", durationSec = 1800, completed = true): CiRun => ({ date, conclusion, durationSec, completed });

describe("periods", () => {
  it("counts days and months inclusively", () => {
    expect(periodDays({ from: "2026-01-01", to: "2026-01-31" })).toBe(31);
    expect(periodMonths({ from: "2026-01-01", to: "2026-12-31" })).toBeCloseTo(11.99, 1);
  });
  it("builds presets and the previous period", () => {
    expect(presetPeriod("30d", "2026-10-04")).toEqual({ from: "2026-09-05", to: "2026-10-04" });
    expect(presetPeriod("year", "2026-10-04")).toEqual({ from: "2026-01-01", to: "2026-10-04" });
    expect(previousPeriod({ from: "2026-09-05", to: "2026-10-04" })).toEqual({ from: "2026-08-06", to: "2026-09-04" });
  });
  it("splits a period into clipped calendar months", () => {
    expect(monthsOf({ from: "2026-01-15", to: "2026-03-10" })).toEqual([
      { from: "2026-01-15", to: "2026-01-31" },
      { from: "2026-02-01", to: "2026-02-28" },
      { from: "2026-03-01", to: "2026-03-10" },
    ]);
  });
});

describe("formulas with estimates (no CI)", () => {
  // One average month: 30.4375 days
  const month = { from: "2026-01-01", to: "2026-01-30" };
  it("computes runs, avoided effort, execution, maintenance and net", () => {
    const m = projectMetrics(project(), { from: "2026-01-01", to: "2026-12-31" }, null);
    // ≈ 12 months: runs 40×11.99 ≈ 479.7; avoided 479.7×180×6/60 ≈ 8634; exec 479.7×180×20/3600 ≈ 479.7; maint 8×11.99 ≈ 95.9
    expect(m.runs).toBeCloseTo(479.7, 0);
    expect(m.manualAvoidedHours).toBeCloseTo(8634.5, 0);
    expect(m.executionHours).toBeCloseTo(479.7, 0);
    expect(m.maintenanceHours).toBeCloseTo(95.9, 0);
    expect(m.netHours).toBeCloseTo(8634.5 - 479.7 - 95.9, 0);
    expect(m.usingEstimates).toBe(true);
    expect(m.passRate).toBeNull();
    expect(periodDays(month)).toBe(30);
  });
  it("coverage, cost and ROI", () => {
    expect(projectMetrics(project(), month, null).coverage).toBe(75);
    expect(projectMetrics(project({ hourlyCost: 1500 }), month, null).costSaved).toBeGreaterThan(0);
    expect(projectMetrics(project(), month, null).costSaved).toBeNull();
    expect(roiPercent(312, 120)).toBe(160);
    expect(roiPercent(60, 120)).toBe(-50);
    expect(roiPercent(10, 0)).toBeNull();
    expect(overallCoverage([{ automatedTests: 180, totalTests: 240 }, { automatedTests: 20, totalTests: 160 }])).toBe(50);
  });
});

describe("formulas with CI data", () => {
  const period = { from: "2026-09-01", to: "2026-09-30" };
  const ci = { runs: [run("2026-09-02"), run("2026-09-10", "failure", 3600), run("2026-09-20", null as never, null as never, false), run("2026-08-20")] };
  it("uses the linked suite's run count and durations; pass rate from completed runs", () => {
    const m = projectMetrics(project(), period, ci);
    expect(m.runs).toBe(3);
    expect(m.manualAvoidedHours).toBe(54); // 3 × 180 × 6 / 60
    expect(m.executionHours).toBe(1.5); // 1800 + 3600 + 0 s
    expect(m.passRate).toBe(50);
    expect(m.usingEstimates).toBe(false);
  });
  it("falls back to estimates when CI data is unavailable", () => {
    expect(projectMetrics(project(), period, null).usingEstimates).toBe(true);
  });
  it("buckets the pass rate by ISO week", () => {
    expect(passRateByWeek([ci], period)).toEqual([
      { week: "2026-08-31", passRate: 100, runs: 1 },
      { week: "2026-09-07", passRate: 0, runs: 1 },
    ]);
  });
});

describe("break-even", () => {
  it("is the first month where cumulative net ≥ build cost", () => {
    // ~1,404 net hours per month with defaults minus small parts; a big build cost delays break-even
    const s = monthlySeries(project({ buildHours: 3000 }), { from: "2026-01-01", to: "2026-06-30" }, null);
    expect(s.points.map((p) => p.label)).toEqual(["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"]);
    expect(s.breakEven).toBe("May 2026"); // ≈ 684 net h per 31-day month
    expect(monthlySeries(project({ buildHours: 1e9 }), { from: "2026-01-01", to: "2026-03-31" }, null).breakEven).toBeNull();
  });
});

describe("coverage over time", () => {
  it("uses each project's latest snapshot on or before each date, plus an overall line", () => {
    const projects = [project({ id: "a" }), project({ id: "b" })];
    const series = coverageOverTime(projects, [
      { projectId: "a", date: "2026-01-01", totalTests: 100, automatedTests: 50 },
      { projectId: "b", date: "2026-02-01", totalTests: 100, automatedTests: 10 },
      { projectId: "a", date: "2026-03-01", totalTests: 100, automatedTests: 80 },
    ]);
    expect(series).toEqual([
      { date: "2026-01-01", overall: 50, a: 50 },
      { date: "2026-02-01", overall: 30, a: 50, b: 10 },
      { date: "2026-03-01", overall: 45, a: 80, b: 10 },
    ]);
  });
});

describe("summary", () => {
  const period = presetPeriod("90d", "2026-10-04");
  const projects = [project({ id: "a", name: "Checkout", hourlyCost: 1000 }), project({ id: "b", name: "=cmd", ciSuiteId: "s", totalTests: 100, automatedTests: 20, buildHours: 40 })];
  const ci = new Map([["b", { runs: [run("2026-09-10"), run("2026-09-11", "failure")] }]]);
  const s = summarize(projects, period, ci, []);
  it("builds KPIs, rows and the cumulative series", () => {
    expect(s.rows).toHaveLength(2);
    expect(s.rows[1]).toMatchObject({ runs: 2, passRate: 50, usingEstimates: false });
    expect(s.kpis.coverage).toBe(composeCoverage());
    expect(s.kpis.passRate).toBe(50);
    expect(s.kpis.costSaved).toBe(s.rows[0].costSaved);
    expect(s.cumulative.at(-1)!.buildCost).toBe(160);
    expect(s.kpis.hoursSaved).toBeCloseTo(s.rows[0].netHours + s.rows[1].netHours, 0);
  });
  it("writes a status-update sentence and a safe CSV", () => {
    expect(summaryText(s, "in the last 90 days", "₹")).toMatch(/^Automation saved \d+ hours in the last 90 days across 2 projects \(≈ ₹[\d,]+ saved\) \(ROI -?\d+%, coverage 59%, CI pass rate 50%\)\.$/);
    const csv = rowsCsv(s.rows, "₹").split("\n");
    expect(csv[0]).toContain("Cost saved (₹)");
    expect(csv[2].startsWith(`"'=cmd"`)).toBe(true);
  });
});

function composeCoverage() {
  return Math.round((200 / 340) * 1000) / 10;
}
