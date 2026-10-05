/**
 * Quality score (0–100) for any result: 70% row quality (six checks per row) + 30% coverage of
 * the limits and allowed values found in the requirement (100% row quality when none were found).
 */

import { describeLimit, type Requirement } from "./requirement";
import { lines, type TestCase } from "./types";

export const GENERIC_PHRASES = /\bthe feature\b|works correctly|as expected|\bappropriate(?:ly)?\b|should work|properly handled/i;

export type RowIssue = "test data is empty" | "fewer than 5 steps" | "fewer than 3 expected-result lines" | "title doesn't start with \"Verify\"" | "generic wording" | "duplicate title";

export type QualityReport = {
  score: number;
  rowScore: number;
  /** null when the requirement has no limits / values to cover. */
  coverage: number | null;
  issues: Map<string, RowIssue[]>;
  weakKeys: Set<string>;
  uncovered: string[];
};

export function rowIssues(c: TestCase, duplicate: boolean): RowIssue[] {
  const out: RowIssue[] = [];
  if (!c.testData.trim()) out.push("test data is empty");
  if (c.steps.filter((s) => s.trim()).length < 5) out.push("fewer than 5 steps");
  if (lines(c.expectedResult).length < 3) out.push("fewer than 3 expected-result lines");
  if (!/^verify\b/i.test(c.title.trim())) out.push('title doesn\'t start with "Verify"');
  if (GENERIC_PHRASES.test([c.title, c.expectedResult, ...c.steps].join(" "))) out.push("generic wording");
  if (duplicate) out.push("duplicate title");
  return out;
}

/** Case text with digit-group commas removed, for number matching. */
const haystack = (c: TestCase) => [c.title, c.testData, c.steps.join(" "), c.expectedResult, c.preconditions].join(" \n ").replace(/(\d),(?=\d)/g, "$1");

const hasNumber = (text: string, n: number) => new RegExp(`(^|[^\\d.])${n < 0 ? "[-−]" : ""}${Math.abs(n)}(?![\\d])`).test(text);

/** Everything the requirement asks to be covered, with a check against the cases' text. */
export function coverageTargets(req: Requirement): { label: string; covered: (text: string) => boolean }[] {
  const out: { label: string; covered: (text: string) => boolean }[] = [];
  for (const l of req.lists) {
    for (const v of l.values) {
      const re = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      out.push({ label: `${l.subject}: ${v}`, covered: (t) => re.test(t) });
    }
  }
  for (const l of req.limits) {
    const bounds: [string, number][] = [];
    if (l.max !== undefined) bounds.push(["at", l.max], ["+1", l.max + 1], ["−1", l.max - 1]);
    if (l.min !== undefined && l.min !== l.max) bounds.push(["at min", l.min], ["min − 1", l.min - 1], ["min + 1", l.min + 1]);
    for (const [label, n] of bounds) out.push({ label: `${describeLimit(l)} — ${label} (${n})`, covered: (t) => hasNumber(t, n) });
  }
  return out;
}

export function scoreCases(cases: TestCase[], req: Requirement | null): QualityReport {
  const titles = new Map<string, number>();
  for (const c of cases) {
    const k = c.title.trim().toLowerCase();
    titles.set(k, (titles.get(k) ?? 0) + 1);
  }
  const issues = new Map<string, RowIssue[]>();
  const weakKeys = new Set<string>();
  let rowTotal = 0;
  for (const c of cases) {
    const list = rowIssues(c, (titles.get(c.title.trim().toLowerCase()) ?? 0) > 1);
    if (list.length) {
      issues.set(c.key, list);
      weakKeys.add(c.key);
    }
    rowTotal += (6 - list.length) / 6;
  }
  const rowScore = cases.length ? rowTotal / cases.length : 0;

  const targets = req ? coverageTargets(req) : [];
  const text = cases.map(haystack).join("\n");
  const uncovered = targets.filter((t) => !t.covered(text)).map((t) => t.label);
  const coverage = targets.length ? (targets.length - uncovered.length) / targets.length : null;
  // Rounded down, so any weak row or gap keeps the score below 100.
  const score = Math.floor(100 * (coverage === null ? rowScore : 0.7 * rowScore + 0.3 * coverage) + 1e-9);
  return { score: cases.length ? score : 0, rowScore, coverage, issues, weakKeys, uncovered };
}
