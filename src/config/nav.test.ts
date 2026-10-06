import { describe, expect, it } from "vitest";

import { isActivePath, isNavChildActive, navGroups, navItems } from "./nav";

const bugTracker = navItems.find((i) => i.href === "/bug-tracker")!;
const [dashboard, activity, workload] = bugTracker.children!;

describe("isActivePath", () => {
  it("matches the route and its sub-routes", () => {
    expect(isActivePath("/ci", "/ci")).toBe(true);
    expect(isActivePath("/bug-tracker/activity", "/bug-tracker")).toBe(true);
  });

  it("does not match routes that only share a prefix", () => {
    expect(isActivePath("/ci-other", "/ci")).toBe(false);
  });

  it("matches home only exactly", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/ci", "/")).toBe(false);
  });
});

describe("isNavChildActive", () => {
  it("Customer Issue RCA: Dashboard owns issue pages; pack, runs and settings own theirs", () => {
    const ci = navItems.find((i) => i.href === "/customer-issues")!;
    const [ciDash, pack, runs, settings] = ci.children!;
    expect(isNavChildActive("/customer-issues/abc123", ci, ciDash)).toBe(true);
    expect(isNavChildActive("/customer-issues/runs/r1", ci, runs)).toBe(true);
    expect(isNavChildActive("/customer-issues/runs/r1", ci, ciDash)).toBe(false);
    expect(isNavChildActive("/customer-issues/pack", ci, pack)).toBe(true);
    expect(isNavChildActive("/customer-issues/settings", ci, settings)).toBe(true);
  });

  it("highlights Dashboard on the dashboard and feature detail pages", () => {
    expect(isNavChildActive("/bug-tracker", bugTracker, dashboard)).toBe(true);
    expect(isNavChildActive("/bug-tracker/abc123", bugTracker, dashboard)).toBe(true);
  });

  it("highlights only Activity on the activity page", () => {
    expect(isNavChildActive("/bug-tracker/activity", bugTracker, activity)).toBe(true);
    expect(isNavChildActive("/bug-tracker/activity", bugTracker, dashboard)).toBe(false);
    expect(isNavChildActive("/bug-tracker/activity", bugTracker, workload)).toBe(false);
  });
});

describe("navItems", () => {
  it("lists every module route once", () => {
    const hrefs = navItems.map((i) => i.href);
    expect(hrefs).toEqual([
      "/test-case-generator",
      "/tc-library",
      "/risk-planner",
      "/release-readiness",
      "/pr-qa-session",
      "/api-playground",
      "/bug-tracker",
      "/bug-formatter",
      "/customer-issues",
      "/ai-pr-review",
      "/ci",
      "/failure-analyzer",
      "/locator-helper",
      "/selenium-to-playwright",
      "/test-data-generator",
      "/qa-tracker",
      "/automation-roi",
    ]);
  });

  it("groups modules into Test Planning, Test Execution, Automation and Reports & Insights", () => {
    expect(navGroups.map((g) => [g.title, g.items.length])).toEqual([
      ["Test Planning", 4],
      ["Test Execution", 6],
      ["Automation", 5],
      ["Reports & Insights", 2],
    ]);
  });
});
