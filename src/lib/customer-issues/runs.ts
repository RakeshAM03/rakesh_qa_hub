/**
 * Release execution runs over the mandatory regression pack: completion rules, counts, the
 * snapshot taken at run creation and the run report. Pure.
 */

import { numbered } from "@/lib/tcgen/types";

export type RunResult = "PENDING" | "PASS" | "FAIL" | "BLOCKED" | "NA";
export type RunStatus = "IN_PROGRESS" | "BLOCKED" | "COMPLETE";

/** Copy of a case when the run was created (later edits or retirement don't change the run). */
export type CaseSnapshot = {
  caseId: string;
  title: string;
  category: string;
  type: string;
  priority: string;
  preconditions: string;
  steps: string[];
  testData: string;
  expectedResult: string;
  automated: string;
  issueId: string;
  issueKey: string;
  issueSummary: string;
  product: string | null;
  module: string | null;
};

export type ResultLite = { result: RunResult; reason?: string | null };

/** A result counts as done when it's Pass, or N/A with a reason. */
export const isDone = (r: ResultLite) => r.result === "PASS" || (r.result === "NA" && !!r.reason?.trim());

/** Fail or Blocked anywhere → Blocked; every case done → Complete; else In progress. */
export function runStatus(results: ResultLite[]): RunStatus {
  if (results.some((r) => r.result === "FAIL" || r.result === "BLOCKED")) return "BLOCKED";
  if (results.length > 0 && results.every(isDone)) return "COMPLETE";
  return "IN_PROGRESS";
}

export function runCounts(results: ResultLite[]) {
  const c = { total: results.length, executed: 0, pass: 0, fail: 0, blocked: 0, na: 0, pending: 0 };
  for (const r of results) {
    if (r.result === "PENDING") c.pending++;
    else c.executed++;
    if (r.result === "PASS") c.pass++;
    if (r.result === "FAIL") c.fail++;
    if (r.result === "BLOCKED") c.blocked++;
    if (r.result === "NA") c.na++;
  }
  return c;
}

export type PackCase = { productId: string | null; mandatory: boolean; retired: boolean };

/** Cases a run snapshots: mandatory, not retired, in the chosen products (none chosen = all). */
export function packForRun<T extends PackCase>(cases: T[], productIds: string[]): T[] {
  return cases.filter((c) => c.mandatory && !c.retired && (!productIds.length || (c.productId !== null && productIds.includes(c.productId))));
}

const LABEL: Record<RunResult, string> = { PENDING: "Pending", PASS: "Pass", FAIL: "Fail", BLOCKED: "Blocked", NA: "N/A" };
const STATUS: Record<RunStatus, string> = { IN_PROGRESS: "In progress", BLOCKED: "Blocked", COMPLETE: "Complete" };

/** Markdown report for Slack / email. */
export function runReportMarkdown(run: { name: string; status: RunStatus; environment: string | null; build: string | null; products: string[] }, results: (ResultLite & { snapshot: CaseSnapshot; notes?: string | null; executedBy?: string | null })[]) {
  const c = runCounts(results);
  const problems = results.filter((r) => r.result === "FAIL" || r.result === "BLOCKED");
  return [
    `**Customer-issue regression run: ${run.name}** — ${STATUS[run.status]}`,
    [run.products.length ? `Products: ${run.products.join(", ")}` : "Products: all", run.environment && `Environment: ${run.environment}`, run.build && `Build: ${run.build}`].filter(Boolean).join(" · "),
    `${c.executed}/${c.total} executed · ✅ ${c.pass} passed · ❌ ${c.fail} failed · ⛔ ${c.blocked} blocked · N/A ${c.na} · ⏳ ${c.pending} pending`,
    ...(problems.length ? ["", "**Failed / blocked:**", ...problems.map((r) => `- ${LABEL[r.result]} — ${r.snapshot.caseId} ${r.snapshot.title} (${r.snapshot.issueKey})${r.notes?.trim() ? ` — ${r.notes.trim()}` : ""}`)] : []),
  ].join("\n");
}

/** Bug Formatter pre-fill for a failed case, linked to its customer issue. */
export function bugFromFailedCase(s: CaseSnapshot, notes: string | null | undefined, runName: string) {
  return {
    title: `Regression of ${s.issueKey}: ${s.title.replace(/^Verify\s+/i, "")}`.slice(0, 200),
    severity: s.priority === "P1" ? ("P1" as const) : ("P2" as const),
    steps: s.steps,
    expected: s.expectedResult.replace(/^\s*\d+[.)]\s*/gm, "").split("\n").filter(Boolean).join("; "),
    actual: notes?.trim() || "(describe what happened)",
    notes: `Customer issue regression case ${s.caseId} failed in run "${runName}". Linked customer issue: ${s.issueKey} — ${s.issueSummary}.${s.product ? ` Product: ${s.product}.` : ""}${s.module ? ` Module: ${s.module}.` : ""}`,
  };
}

/** Steps as numbered text (for the report workbook). */
export const stepsText = (s: CaseSnapshot) => numbered(s.steps);
