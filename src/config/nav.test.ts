import { describe, expect, it } from "vitest";

import { isActivePath, isNavChildActive, navItems } from "./nav";

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
      "/ci",
      "/bug-tracker",
      "/qa-tracker",
      "/qa-digest",
      "/pr-qa-session",
      "/ai-pr-review",
      "/tc-library",
      "/bug-formatter",
    ]);
  });
});
