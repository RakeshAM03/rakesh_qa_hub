import { describe, expect, it } from "vitest";

import {
  autoResultFor,
  buildSnapshot,
  effectiveStatus,
  releaseSummary,
  ruleCiGreen,
  ruleNoP0Flags,
  ruleOpenBugs,
  ruleValidRate,
  scoreRelease,
  targetDateText,
  type GateLike,
  type IssueLite,
} from "./readiness";

let n = 0;
const gate = (status: GateLike["status"], patch: Partial<GateLike> = {}): GateLike => ({
  id: String(++n),
  section: "Testing",
  title: `Gate ${n}`,
  type: "MANUAL",
  status,
  isBlocker: false,
  weight: 1,
  ...patch,
});

describe("effective status", () => {
  it("prefers override, then a successful auto check, then the manual value", () => {
    expect(effectiveStatus(gate("PENDING", { type: "NO_P0", autoResult: { status: "PASS", detail: "" } }))).toBe("PASS");
    expect(effectiveStatus(gate("FAIL", { type: "NO_P0", autoResult: { status: null, detail: "Can't check" } }))).toBe("FAIL");
    expect(effectiveStatus(gate("PENDING", { type: "NO_P0", autoResult: { status: "FAIL", detail: "" }, override: { status: "PASS", note: "accepted", by: "QA", at: "" } }))).toBe("PASS");
    expect(effectiveStatus(gate("PASS", { autoResult: { status: "FAIL", detail: "" } }))).toBe("PASS"); // manual gates ignore auto
  });
});

describe("score weighting", () => {
  it("is the weighted share of passed gates, excluding N/A", () => {
    expect(scoreRelease([gate("PASS"), gate("PASS"), gate("PENDING"), gate("NA")]).score).toBe(67);
    expect(scoreRelease([gate("PASS", { weight: 3 }), gate("FAIL")]).score).toBe(75);
    expect(scoreRelease([]).score).toBe(0);
    expect(scoreRelease([gate("NA")]).score).toBe(0);
  });
  it("counts blockers three times", () => {
    // blocker passed (3) + normal failed (1) → 75%
    expect(scoreRelease([gate("PASS", { isBlocker: true }), gate("FAIL")]).score).toBe(75);
    // blocker pending (3) + normal passed (1) → 25%
    expect(scoreRelease([gate("PENDING", { isBlocker: true }), gate("PASS")]).score).toBe(25);
  });
  it("counts statuses and lists failed blockers", () => {
    const s = scoreRelease([gate("PASS"), gate("FAIL", { isBlocker: true, title: "No P0" }), gate("FAIL"), gate("NA"), gate("PENDING")]);
    expect(s.counts).toEqual({ PASS: 1, FAIL: 2, NA: 1, PENDING: 1 });
    expect(s.blockers.map((b) => b.title)).toEqual(["No P0"]);
  });
});

describe("verdict rules", () => {
  const passes = (k: number) => Array.from({ length: k }, () => gate("PASS"));
  it("Ready to go at ≥ 90% with no failed or pending blockers", () => {
    expect(scoreRelease([...passes(9), gate("FAIL")]).verdict).toBe("READY");
  });
  it("At risk at 70–89%, or with a pending blocker", () => {
    expect(scoreRelease([...passes(8), gate("FAIL"), gate("FAIL")]).verdict).toBe("AT_RISK");
    expect(scoreRelease([...passes(30), gate("PENDING", { isBlocker: true })]).verdict).toBe("AT_RISK");
  });
  it("Not ready below 70% or with any failed blocker", () => {
    expect(scoreRelease([...passes(6), ...Array.from({ length: 4 }, () => gate("FAIL"))]).verdict).toBe("NOT_READY");
    expect(scoreRelease([...passes(30), gate("FAIL", { isBlocker: true })]).verdict).toBe("NOT_READY");
  });
});

describe("auto-gate rules", () => {
  const issue = (severity: IssueLite["severity"], status: IssueLite["status"] = "OPEN", isValid = true): IssueLite => ({ severity, status, isValid });

  it("CI suite green: latest completed run of every linked suite", () => {
    expect(ruleCiGreen({ connected: true, linked: 2, runs: [{ suiteName: "A", conclusion: "success" }, { suiteName: "B", conclusion: "success" }] })).toMatchObject({ status: "PASS" });
    expect(ruleCiGreen({ connected: true, linked: 2, runs: [{ suiteName: "A", conclusion: "success" }, { suiteName: "B", conclusion: "failure" }] })).toEqual({
      status: "FAIL",
      detail: "Latest run not green: B (failure)",
    });
    expect(ruleCiGreen({ connected: false, linked: 1, runs: [] })).toEqual({ status: null, detail: "Can't check — connect GitHub (GITHUB_TOKEN)" });
    expect(ruleCiGreen({ connected: true, linked: 0, runs: [] }).status).toBeNull();
    expect(ruleCiGreen({ connected: true, linked: 1, runs: [{ suiteName: "A", conclusion: null }] }).detail).toMatch(/no completed runs/);
    expect(ruleCiGreen({ connected: true, linked: 1, runs: [{ suiteName: "A", error: "Not found" }] }).status).toBeNull();
  });

  it("No open P0 / P1: counts only valid, open issues", () => {
    const issues = [issue("P0", "RESOLVED"), issue("P0", "OPEN", false), issue("P1", "IN_PROGRESS"), issue("P2")];
    expect(ruleOpenBugs("P0", issues, 1)).toEqual({ status: "PASS", detail: "0 open P0 issues" });
    expect(ruleOpenBugs("P1", issues, 1)).toEqual({ status: "FAIL", detail: "1 open P1 issue" });
    expect(ruleOpenBugs("P1", issues, 1, 2)).toEqual({ status: "PASS", detail: "1 open P1 issue (max 2)" });
    expect(ruleOpenBugs("P0", issues, 0).status).toBeNull();
  });

  it("Valid-bug rate against a threshold", () => {
    const issues = [issue("P2"), issue("P2"), issue("P2"), issue("P2", "OPEN", false)];
    expect(ruleValidRate(issues, 1, 80)).toEqual({ status: "FAIL", detail: "75% valid (threshold 80%)" });
    expect(ruleValidRate(issues, 1, 70).status).toBe("PASS");
    expect(ruleValidRate([], 1).status).toBeNull();
  });

  it("No P0 review flags in the last N days for linked repos", () => {
    const now = Date.parse("2026-10-04T00:00:00Z");
    const flags = [
      { severity: "P0" as const, repo: "org/web", date: "2026-10-01T00:00:00Z" },
      { severity: "P0" as const, repo: "org/web", date: "2026-08-01T00:00:00Z" },
      { severity: "P1" as const, repo: "org/web", date: "2026-10-02T00:00:00Z" },
      { severity: "P0" as const, repo: "org/other", date: "2026-10-02T00:00:00Z" },
    ];
    expect(ruleNoP0Flags(flags, ["Org/Web"], 14, now)).toEqual({ status: "FAIL", detail: "1 P0 flag in the last 14 days" });
    expect(ruleNoP0Flags(flags, ["org/web"], 1, now).status).toBe("PASS");
    expect(ruleNoP0Flags(flags, [], 14, now).status).toBeNull();
  });

  it("dispatches by gate type with default config", () => {
    const data = { issues: [issue("P1")], linkedFeatures: 1, flags: [], linkedRepos: [], ci: { connected: false, linked: 0, runs: [] } };
    expect(autoResultFor({ type: "NO_P1", config: null }, data)?.status).toBe("FAIL");
    expect(autoResultFor({ type: "NO_P1", config: { maxAllowed: 1 } }, data)?.status).toBe("PASS");
    expect(autoResultFor({ type: "MANUAL", config: null }, data)).toBeNull();
  });
});

describe("snapshot and summary", () => {
  const gates = [
    gate("PASS", { title: "Smoke" }),
    gate("PASS", { type: "NO_P0", isBlocker: true, title: "No open P0 bugs", autoResult: { status: "PASS", detail: "0 open P0 issues" } }),
    gate("FAIL", { title: "Cross-browser" }),
    gate("NA", { title: "Monitoring" }),
  ];
  const signoffs = [
    { role: "QA", name: "Sam", decision: "APPROVE" as const },
    { role: "Product", decision: "PENDING" as const },
  ];
  it("freezes effective statuses and sign-offs at decision time", () => {
    const snap = buildSnapshot(gates, signoffs);
    expect(snap.score).toBe(80);
    expect(snap.gates[1]).toMatchObject({ title: "No open P0 bugs", status: "PASS", detail: "0 open P0 issues" });
    gates[0].status = "FAIL"; // later edits don't change the snapshot
    expect(snap.gates[0].status).toBe("PASS");
    gates[0].status = "PASS";
    expect(snap.signoffs).toEqual([
      { role: "QA", name: "Sam", decision: "APPROVE", comment: null, signedAt: null },
      { role: "Product", name: null, decision: "PENDING", comment: null, signedAt: null },
    ]);
  });
  it("writes a shareable summary", () => {
    expect(releaseSummary({ name: "Checkout revamp", version: "v2.4.0", status: "GO_WITH_ISSUES" }, gates, signoffs, { decision: "GO_WITH_ISSUES", knownIssues: ["Safari layout glitch"] })).toBe(
      [
        "### Release v2.4.0 — Checkout revamp",
        "Decision: **GO WITH KNOWN ISSUES** (score 80%)",
        "✅ 2 passed · ❌ 1 failed (non-blocker) · ➖ 1 N/A",
        "Known issues: Safari layout glitch",
        "Sign-offs: QA ✅, Product ⏳",
      ].join("\n"),
    );
    expect(releaseSummary({ name: "X", status: "PLANNED" }, gates, [], null, "slack")).toMatch(/^\*Release X\*\nStatus: \*Planned\* · readiness 80% \(At risk\)/);
  });
  it("describes the target date", () => {
    expect(targetDateText("2026-10-07", "2026-10-04")).toBe("in 3 days");
    expect(targetDateText("2026-10-04", "2026-10-04")).toBe("today");
    expect(targetDateText("2026-10-02", "2026-10-04")).toBe("2 days overdue");
  });
});
