import { describe, expect, it } from "vitest";

import { ruleCustomerRegression } from "@/lib/readiness";

import { bugFromFailedCase, isDone, packForRun, runCounts, runReportMarkdown, runStatus, type CaseSnapshot } from "./runs";

const snap: CaseSnapshot = {
  caseId: "TC_CI_DEMO-104_01",
  title: "Verify an item can be saved with an archived item's name",
  category: "Functional",
  type: "Positive",
  priority: "P1",
  preconditions: "1. Signed in",
  steps: ["Open Items", "Save an item named like an archived one"],
  testData: "Name: Sample item",
  expectedResult: "1. The item is saved\n2. No duplicate-name error",
  automated: "NO",
  issueId: "i1",
  issueKey: "DEMO-104",
  issueSummary: "Cannot save item with an archived item's name",
  product: "Demo Product B",
  module: "Items",
};

describe("run completion rules", () => {
  it("Complete only when every case is Pass or N/A with a reason", () => {
    expect(runStatus([{ result: "PASS" }, { result: "NA", reason: "Not in this release" }])).toBe("COMPLETE");
    expect(runStatus([{ result: "PASS" }, { result: "NA", reason: " " }])).toBe("IN_PROGRESS");
    expect(runStatus([{ result: "PASS" }, { result: "PENDING" }])).toBe("IN_PROGRESS");
    expect(runStatus([])).toBe("IN_PROGRESS");
    expect(isDone({ result: "NA" })).toBe(false);
  });

  it("any Fail or Blocked blocks the run", () => {
    expect(runStatus([{ result: "PASS" }, { result: "FAIL" }])).toBe("BLOCKED");
    expect(runStatus([{ result: "BLOCKED" }, { result: "PENDING" }])).toBe("BLOCKED");
  });

  it("counts executed, pass, fail, blocked, N/A and pending", () => {
    expect(runCounts([{ result: "PASS" }, { result: "FAIL" }, { result: "NA", reason: "x" }, { result: "PENDING" }])).toEqual({ total: 4, executed: 3, pass: 1, fail: 1, blocked: 0, na: 1, pending: 1 });
  });
});

describe("pack snapshot", () => {
  const cases = [
    { id: "a", productId: "p1", mandatory: true, retired: false },
    { id: "b", productId: "p2", mandatory: true, retired: false },
    { id: "c", productId: null, mandatory: true, retired: false },
    { id: "d", productId: "p1", mandatory: false, retired: false },
    { id: "e", productId: "p1", mandatory: true, retired: true },
  ];
  it("takes mandatory, active cases of the chosen products (none chosen = all)", () => {
    expect(packForRun(cases, ["p1"]).map((c) => c.id)).toEqual(["a"]);
    expect(packForRun(cases, ["p1", "p2"]).map((c) => c.id)).toEqual(["a", "b"]);
    expect(packForRun(cases, []).map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
});

describe("Release Readiness gate: Customer issue regression pack passed", () => {
  const run = (over: Partial<Parameters<typeof ruleCustomerRegression>[0] & object> = {}) => ({ id: "r1", name: "v2.5 regression", status: "IN_PROGRESS" as const, total: 10, executed: 10, failed: 0, blocked: 0, ...over });
  it("can't check without a linked run", () => {
    expect(ruleCustomerRegression(null)).toEqual({ status: null, detail: "Can't check — link a customer-issue regression run to this release" });
  });
  it("passes only when the run is Complete with 0 Fail / 0 Blocked, and links to the run", () => {
    expect(ruleCustomerRegression(run({ status: "COMPLETE" }))).toEqual({ status: "PASS", detail: "10/10 executed, 0 failed (v2.5 regression)", href: "/customer-issues/runs/r1" });
    expect(ruleCustomerRegression(run({ status: "BLOCKED", failed: 1 }))).toMatchObject({ status: "FAIL", detail: "10/10 executed, 1 failed (v2.5 regression)" });
    expect(ruleCustomerRegression(run({ status: "BLOCKED", blocked: 2 }))).toMatchObject({ status: "FAIL", detail: "10/10 executed, 0 failed, 2 blocked (v2.5 regression)" });
    expect(ruleCustomerRegression(run({ executed: 6 }))).toMatchObject({ status: "FAIL", detail: "6/10 executed, 0 failed (v2.5 regression) — not complete yet" });
  });
});

describe("reports and hand-off", () => {
  it("Markdown report lists failures with their customer issue", () => {
    const md = runReportMarkdown({ name: "v2.5 regression", status: "BLOCKED", environment: "Staging", build: "v2.5.0-rc1", products: ["Demo Product B"] }, [
      { result: "FAIL", snapshot: snap, notes: "Still shows 'name already used'" },
      { result: "PASS", snapshot: { ...snap, caseId: "TC_CI_DEMO-104_02" } },
    ]);
    expect(md).toContain("**Customer-issue regression run: v2.5 regression** — Blocked");
    expect(md).toContain("Products: Demo Product B · Environment: Staging · Build: v2.5.0-rc1");
    expect(md).toContain("2/2 executed · ✅ 1 passed · ❌ 1 failed");
    expect(md).toContain("- Fail — TC_CI_DEMO-104_01 Verify an item can be saved with an archived item's name (DEMO-104) — Still shows 'name already used'");
  });

  it("a failed case becomes a Bug Formatter bug linked to the customer issue", () => {
    const bug = bugFromFailedCase(snap, "Error toast shown", "v2.5 regression");
    expect(bug).toMatchObject({ title: "Regression of DEMO-104: an item can be saved with an archived item's name", severity: "P1", steps: snap.steps, expected: "The item is saved; No duplicate-name error", actual: "Error toast shown" });
    expect(bug.notes).toContain("TC_CI_DEMO-104_01 failed in run \"v2.5 regression\". Linked customer issue: DEMO-104");
  });
});
