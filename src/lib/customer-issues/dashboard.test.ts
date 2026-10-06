import { describe, expect, it } from "vitest";

import { DEFAULT_LISTS } from "@/config/customer-issues";

import { breakdown, catchableByProduct, kpis, leakageInsights, perMonth, quarters, subBreakdown, topModules, type DashIssue } from "./dashboard";
import { Lists, type ListItemDto } from "./model";

const lists = new Lists([
  ...DEFAULT_LISTS.map((i): ListItemDto => ({ key: null, description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, active: true, ...i })),
  { id: "pA", list: "PRODUCT", key: null, name: "Demo Product A", description: null, parentId: null, defaultCatchable: null, defaultOwnerId: null, sortOrder: 0, active: true },
]);
const id = (list: ListItemDto["list"], name: string) => lists.items.find((i) => i.list === list && i.name === name)!.id;
const VALID = id("DISPOSITION", "Valid Bug");

const base: DashIssue = {
  createdDate: "2026-10-02",
  productId: "pA",
  module: "Checkout",
  dispositionId: VALID,
  rcaCategoryId: id("RCA_CATEGORY", "Code Defect"),
  rcaSubcategoryId: id("RCA_SUBCATEGORY", "Logic error"),
  caughtAtId: id("CAUGHT_AT", "Code review / unit tests"),
  catchable: "YES",
  whyEscapedId: id("WHY_ESCAPED", "Missing test case"),
  detectedById: id("DETECTED_BY", "Customer"),
  ownerTeamId: id("OWNER_TEAM", "Dev"),
  recurring: false,
  regressionRequired: true,
  preventionStatus: "NOT_STARTED",
  needsRca: false,
  caseCount: 3,
  daysToResolve: 2,
  daysToDetect: 10,
};
const issue = (over: Partial<DashIssue>) => ({ ...base, ...over });
const TODAY = "2026-10-06";

const issues: DashIssue[] = [
  issue({}),
  issue({ catchable: "PARTIAL", detectedById: id("DETECTED_BY", "Monitoring"), daysToResolve: 4, daysToDetect: null, recurring: true, preventionStatus: "DONE" }),
  issue({ catchable: "NO", rcaCategoryId: id("RCA_CATEGORY", "Infra / Deployment"), rcaSubcategoryId: id("RCA_SUBCATEGORY", "Static asset/cache issue"), caughtAtId: id("CAUGHT_AT", "Deployment / release checklist"), caseCount: 0 }),
  issue({ dispositionId: id("DISPOSITION", "Duplicate"), catchable: null, detectedById: null, rcaCategoryId: null, rcaSubcategoryId: null, caughtAtId: null, regressionRequired: false, caseCount: 0, daysToResolve: null }),
  issue({ dispositionId: null, needsRca: true, createdDate: "2026-08-14", catchable: null, rcaCategoryId: null, rcaSubcategoryId: null, caughtAtId: null, productId: null, module: "Search", daysToResolve: null }),
  issue({ createdDate: "2026-07-20", productId: null, module: null }),
];

describe("quarters", () => {
  it("current and previous quarter, including across a year", () => {
    expect(quarters("2026-10-06")).toEqual({ current: { from: "2026-10-01", to: "2027-01-01", label: "Q4 2026" }, previous: { from: "2026-07-01", to: "2026-10-01", label: "Q3 2026" } });
    expect(quarters("2027-02-01").previous).toEqual({ from: "2026-10-01", to: "2027-01-01", label: "Q4 2026" });
  });
});

describe("KPIs", () => {
  it("counts this vs last quarter, % catchable, % customers first, queues, recurring, averages, preventions", () => {
    expect(kpis(issues, lists, TODAY)).toEqual({
      quarter: "Q4 2026",
      previousQuarter: "Q3 2026",
      thisQuarter: 4,
      lastQuarter: 2,
      catchablePct: 75, // Valid Bugs with catchable: YES, PARTIAL, NO, YES → 3/4
      customerFirstPct: 80, // detected set on 5, Customer on 4
      needsRca: 1,
      missingCases: 1,
      recurring: 1,
      avgDaysToResolve: 2.5, // 2, 4, 2, 2
      avgDaysToDetect: 10,
      preventionsNotDone: 3,
      othersPct: 0,
    });
  });
});

describe("chart data", () => {
  it("breakdowns are biggest first; sub-categories drill down by category", () => {
    expect(breakdown(issues, lists, "caughtAtId").map((b) => [b.name, b.count])).toEqual([
      ["Code review / unit tests", 3],
      ["Deployment / release checklist", 1],
    ]);
    expect(breakdown(issues, lists, "dispositionId", true).map((b) => [b.name, b.count])).toEqual([
      ["Valid Bug", 4],
      ["Duplicate", 1],
      ["Not set", 1],
    ]);
    expect(subBreakdown(issues, lists, id("RCA_CATEGORY", "Code Defect")).map((b) => [b.name, b.count])).toEqual([["Logic error", 3]]);
  });

  it("per-month counts split by product, top modules, catchable per product", () => {
    const months = perMonth(issues, TODAY, 4);
    expect(months.map((m) => [m.month, m.total])).toEqual([
      ["2026-07", 1],
      ["2026-08", 1],
      ["2026-09", 0],
      ["2026-10", 4],
    ]);
    expect(months[3].byProduct).toEqual({ pA: 4 });
    expect(topModules(issues)).toEqual([
      { id: "Checkout", name: "Checkout", count: 4 },
      { id: "Search", name: "Search", count: 1 },
    ]);
    expect(catchableByProduct(issues, lists)).toEqual([
      { id: "pA", name: "Demo Product A", YES: 1, PARTIAL: 1, NO: 1, UNSET: 0 },
      { id: "", name: "No product", YES: 1, PARTIAL: 0, NO: 0, UNSET: 0 },
    ]);
  });
});

describe("leakage insights", () => {
  it("names the top catch stage, recurring issues, customers-first and missing cases", () => {
    const text = leakageInsights(issues, lists, TODAY);
    expect(text).toContain("Code review / unit tests is the most common catch stage this quarter (67% of classified issues).");
    expect(text).toContain("Code Defect issues doubled vs last quarter (1 → 2).");
    expect(text).toContain("1 issue is recurring — check that their prevention actions are done.");
    expect(text).toContain("Customers found 80% of issues first — monitoring and alerting may be missing problems.");
    expect(text).toContain("1 valid bug has no regression cases yet.");
  });

  it("flags categories that doubled vs last quarter", () => {
    const cd = id("RCA_CATEGORY", "Config / Data");
    const more = [issue({ createdDate: "2026-08-01", rcaCategoryId: cd }), issue({ rcaCategoryId: cd }), issue({ rcaCategoryId: cd })];
    expect(leakageInsights(more, lists, TODAY)).toContain("Config / Data issues doubled vs last quarter (1 → 2).");
  });
});
