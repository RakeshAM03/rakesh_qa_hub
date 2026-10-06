/**
 * Regression test cases for a customer issue, in the hub's Standard Test Case Format.
 * The requirement text for the Test Case Generator engine is built from the issue; checklist mode
 * adds issue-specific cases (exact failure, root-cause variants, related flows) because a single
 * bug report has few fields / limits for the generic checklist to work from.
 */

import { generateChecklist } from "@/lib/tcgen/checklist";
import { defaultInput, numbered, type TcInput, type TestCase } from "@/lib/tcgen/types";

import type { Lists } from "./model";

export type IssueForCases = {
  issueKey: string;
  summary: string;
  description: string | null;
  module: string | null;
  rca: string | null;
  prevention: string | null;
  severity: string | null;
  rcaCategoryId: string | null;
  rcaSubcategoryId: string | null;
};

export type CaseInput = {
  title: string;
  category: string;
  type: string;
  priority: string;
  preconditions: string;
  steps: string[];
  testData: string;
  expectedResult: string;
};

/** TC_CI_<issue-key>_<NN> */
export const caseIdFor = (issueKey: string, n: number) => `TC_CI_${issueKey.toUpperCase()}_${String(n).padStart(2, "0")}`;

/** Next free number after the issue's existing case IDs. */
export function nextCaseNumber(issueKey: string, existingIds: string[]) {
  const prefix = `TC_CI_${issueKey.toUpperCase()}_`;
  return existingIds.filter((id) => id.startsWith(prefix)).reduce((max, id) => Math.max(max, Number(id.slice(prefix.length)) || 0), 0) + 1;
}

/** Root-cause variants to re-test, by sub-category name (fallback: by main category). */
export const VARIANT_HINTS: Record<string, string[]> = {
  "Missing null/validation check": ["an empty response or empty field", "a null value", "a partial response with some fields missing", "an unexpected value or type in the field"],
  "Logic error": ["the opposite condition", "values exactly at the condition's boundary", "existing, archived and deleted records with similar data"],
  "Error handling missing": ["a server error (5xx) from the dependency", "a timeout from the dependency", "a network drop in the middle of the action"],
  "Performance/timeout in code": ["a large data volume", "a slow dependency", "the action repeated quickly several times"],
  "Concurrency/race condition": ["two users doing the same action at once", "a double-click / repeated submit", "the same record open in two tabs"],
  "Backward-compatibility break": ["data created by the previous version", "an older client or API version", "settings saved before the release"],
  "Shared config affected another client": ["every other client / tenant configuration", "the default configuration", "a client with the setting turned off"],
  "Client-specific setting wrong": ["the affected client's configuration", "a client on default settings"],
  "Data migration issue": ["records created before the migration", "records with optional fields empty", "the oldest historical records"],
  "Bad/duplicate data in production": ["duplicate records", "records holding invalid legacy values"],
  "Default values changed": ["new records that use the default", "existing records that must keep their saved value"],
  "Static asset/cache issue": ["a browser that still has the previous version cached", "a hard refresh right after deployment", "assets served from the CDN cache"],
  "Server/DB down or slow": ["a slow database response", "a dependency that is unavailable"],
  "CDN/DNS": ["assets and pages loaded through the CDN", "the site reached from a fresh DNS lookup"],
  "Scaling/load": ["peak-hour load", "many users doing the same action"],
  "Deployment script failure": ["a clean deployment of the release build", "a re-run of the deployment"],
  "Fix missing from release branch": ["the release build — confirm the fix is present"],
  "Merge conflict overwrote a change": ["the release build — confirm both changes are present"],
  "Wrong build deployed": ["the deployed build number / version matching the release"],
  "Feature flag misconfigured": ["the feature flag on", "the feature flag off", "a client without the flag"],
  "Partner API behaviour changed": ["the partner's current response format", "the previous response format"],
  "Partner returned unexpected/empty data": ["an empty response from the partner", "unexpected status values from the partner", "fields missing from the partner response"],
  "Auth/token expiry": ["an expired token", "a token refreshed in the middle of a session"],
  "Rate limit from partner": ["the partner answering 429 Too Many Requests"],
  "Webhook/sync failure": ["the same webhook delivered twice", "webhooks arriving out of order", "a failed sync that is retried"],
  "Edge case not covered": ["the reported edge input", "neighbouring edge inputs (one above / one below)"],
  "Wrong/insufficient test data": ["production-like data variety (long names, special characters, large lists)"],
  "Negative scenario missed": ["invalid input", "an action without the required permission"],
  "Cross-browser/device not tested": ["each supported browser", "mobile screen sizes"],
  "Confusing flow": ["a first-time user following the flow without help"],
  "Missing validation message": ["each invalid input showing a clear message"],
  "Accessibility issue": ["keyboard-only use", "a screen reader"],
  "Access/permission leak": ["a user without the permission", "another client's record ID in the URL or request"],
  "Data exposure": ["responses, exports and logs for another user's data"],
  "Injection/XSS": ["script and HTML input", "SQL and special characters in input"],
};

const CATEGORY_HINTS: Record<string, string[]> = {
  "QA Miss": ["the same scenario with different valid data", "the negative version of the scenario"],
  "QA Skip": ["the full regression of the impacted area"],
  "Requirement Gap": ["the customer's actual workflow end to end"],
  "Code Sync / Release": ["the release build — confirm the fix is present"],
};

const firstSentence = (s: string | null | undefined) => (s ?? "").split(/(?<=[.!?])\s+|\n/)[0]?.trim() ?? "";
const shorten = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const numberedSteps = (text: string | null) =>
  (text ?? "")
    .split(/\n/)
    .map((l) => /^\s*(?:\d+[.)]|[-*•])\s+(.+)$/.exec(l)?.[1]?.trim())
    .filter((x): x is string => !!x);

/** The requirement text handed to the Test Case Generator engine. */
export function requirementText(issue: IssueForCases, lists: Lists): string {
  const sub = lists.name(issue.rcaSubcategoryId);
  const cat = lists.name(issue.rcaCategoryId);
  return [
    `Customer issue ${issue.issueKey}: ${issue.summary}`,
    issue.description?.trim() && `Description:\n${issue.description.trim()}`,
    issue.rca?.trim() && `Root cause and fix (RCA):\n${issue.rca.trim()}`,
    (cat || sub) && `RCA category: ${[cat, sub].filter(Boolean).join(" → ")}`,
    issue.prevention?.trim() && `Prevention action:\n${issue.prevention.trim()}`,
    [
      "Write regression test cases so this issue can never escape again. Cover:",
      "1. The exact failure scenario reported by the customer — it must now pass.",
      "2. The fixed behaviour described in the RCA.",
      `3. Variants of the same root cause${sub ? ` (${sub})` : ""}${variantsFor(issue, lists).length ? `: ${variantsFor(issue, lists).join("; ")}` : ""}.`,
      `4. Closely related flows${issue.module ? ` in ${issue.module}` : ""} that could regress.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function variantsFor(issue: IssueForCases, lists: Lists): string[] {
  const sub = lists.name(issue.rcaSubcategoryId);
  const cat = lists.name(issue.rcaCategoryId);
  return (sub && VARIANT_HINTS[sub]) || (cat && CATEGORY_HINTS[cat]) || ["the same scenario with different valid data", "the same scenario for another user role or client"];
}

/** Test Case Generator input (focused types, Quick depth). */
export function tcInputFor(issue: IssueForCases, lists: Lists): TcInput {
  const base = defaultInput();
  return {
    ...base,
    requirement: requirementText(issue, lists),
    context: { ...base.context, moduleName: issue.module?.trim() || shorten(issue.summary, 40), rules: issue.rca?.trim() ?? "" },
    types: ["positive", "negative", "edge", "regression", "boundary", "validation", "workflow", "reliability"],
    options: { ...base.options, depth: "quick", idPrefix: "CI" },
  };
}

const priorityFor = (severity: string | null) => (severity?.startsWith("P1") ? "P1" : severity?.startsWith("P2") ? "P1" : severity?.startsWith("P3") ? "P2" : "P2");

/** Issue-specific cases: the exact failure, each root-cause variant, related flows. */
export function coreCases(issue: IssueForCases, lists: Lists): CaseInput[] {
  const where = issue.module?.trim() || "the affected area";
  const fixed = firstSentence(issue.rca) || "the behaviour the customer expected";
  const reported = numberedSteps(issue.description);
  const pre = numbered([`The application is up and accessible in the test environment`, `A user with access to ${where} is signed in`, `Test data similar to the reported case (${issue.issueKey}) is available`]);
  const p = priorityFor(issue.severity);
  const exact: CaseInput = {
    title: `Verify the customer scenario from ${issue.issueKey} no longer fails: ${shorten(issue.summary)}`,
    category: "Functional",
    type: "Positive",
    priority: p,
    preconditions: pre,
    steps: reported.length >= 2 ? [...reported, "Observe the result"] : [`Open ${where}`, `Repeat the scenario reported in ${issue.issueKey}: ${issue.summary}`, "Complete the action", "Observe the result on screen", "Refresh the page and check the result again"],
    testData: `Issue: ${issue.issueKey}\nData: same shape as the customer's data (use placeholders, never real customer data)`,
    expectedResult: numbered([`The scenario completes without the reported problem`, `Fixed behaviour: ${fixed}`, "No error message, blank screen or console error appears", "The result is still correct after a refresh"]),
  };
  const variants = variantsFor(issue, lists).map(
    (v): CaseInput => ({
      title: `Verify ${where} handles ${v} (variant of ${issue.issueKey})`,
      category: /permission|another client|script|sql/i.test(v) ? "Security" : /browser|mobile/i.test(v) ? "Compatibility" : /timeout|slow|5xx|network|unavailable|load/i.test(v) ? "Reliability" : "Functional",
      type: /invalid|without|empty|null|missing|error|timeout|expired|429|twice|out of order|unexpected|slow|unavailable/i.test(v) ? "Negative" : "Positive",
      priority: "P2",
      preconditions: pre,
      steps: [`Open ${where}`, `Prepare ${v}`, `Repeat the action from ${issue.issueKey} with that data / condition`, "Observe the result", "Check related records or screens for side effects"],
      testData: `Condition: ${v}`,
      expectedResult: numbered([`The ${where} behaves correctly for ${v}`, `The original problem (${shorten(issue.summary, 60)}) does not appear`, "A clear message is shown if the action can't be completed", "No data is lost or saved incorrectly"]),
    }),
  );
  const related: CaseInput = {
    title: `Verify related flows in ${where} still work after the fix for ${issue.issueKey}`,
    category: "Functional",
    type: "Positive",
    priority: "P3",
    preconditions: pre,
    steps: [`Open ${where}`, "Run the main create / view / edit flows of this area", "Run the flows that share data or code with the fixed scenario", "Check the results and any notifications", "Refresh and confirm the data is unchanged"],
    testData: "Typical valid data for the area",
    expectedResult: numbered(["Every related flow completes successfully", "No new errors or layout problems appear", "Data saved by these flows is correct after a refresh"]),
  };
  return [exact, ...variants, related];
}

export const fromTestCase = (c: TestCase): CaseInput => ({ title: c.title, category: c.category, type: c.type, priority: c.priority, preconditions: c.preconditions, steps: c.steps, testData: c.testData, expectedResult: c.expectedResult });

const RELEVANT = new Set(["Functional", "Validation", "Boundary Value", "Security", "Reliability", "Integration", "Data Integrity", "API"]);

/** Checklist mode: issue-specific cases + the most relevant P1/P2 cases from the engine (no templates, no duplicates). */
export function checklistCases(issue: IssueForCases, lists: Lists, extra = 4): CaseInput[] {
  const core = coreCases(issue, lists);
  const engine = generateChecklist(tcInputFor(issue, lists)).result.testCases.filter((c) => !c.template && RELEVANT.has(c.category) && (c.priority === "P1" || c.priority === "P2"));
  const seen = new Set(core.map((c) => c.title.toLowerCase()));
  const picked = engine.filter((c) => !seen.has(c.title.toLowerCase())).slice(0, extra).map(fromTestCase);
  return [...core, ...picked];
}

/** One TC Library entry per issue: the cases as a Markdown table plus the RCA context. */
export function tcLibraryMarkdown(issue: IssueForCases & { issueUrl?: string | null }, cases: (CaseInput & { caseId: string; mandatory: boolean; automated: string })[], lists: Lists): string {
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return [
    `## ${issue.issueKey} — ${issue.summary}`,
    "",
    `- RCA: ${[lists.name(issue.rcaCategoryId), lists.name(issue.rcaSubcategoryId)].filter(Boolean).join(" → ") || "—"}`,
    issue.rca?.trim() ? `- Root cause and fix: ${issue.rca.trim().replace(/\n+/g, " ")}` : null,
    issue.prevention?.trim() ? `- Prevention: ${issue.prevention.trim().replace(/\n+/g, " ")}` : null,
    "",
    "| ID | Title | Category | Type | Priority | Mandatory | Automated | Preconditions | Steps | Test data | Expected result |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...cases.map((c) => `| ${c.caseId} | ${cell(c.title)} | ${c.category} | ${c.type} | ${c.priority} | ${c.mandatory ? "Yes" : "No"} | ${c.automated} | ${cell(c.preconditions)} | ${cell(numbered(c.steps))} | ${cell(c.testData)} | ${cell(c.expectedResult)} |`),
  ]
    .filter((l) => l !== null)
    .join("\n");
}
