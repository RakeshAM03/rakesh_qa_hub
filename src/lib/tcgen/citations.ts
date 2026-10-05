/**
 * Test-case IDs cited in assumptions and open questions ("… (TC_LOG_008, TC_LOG_009)").
 * Citations must point at cases that exist after the final numbering, so every path that
 * renumbers or drops cases runs its text through these helpers last.
 */

import type { GenerationResult, TestCase } from "./types";

/** TC_LOG_001, TC-LOG-001, TC_API_V2_010 … */
export const CASE_ID = /\bTC[_-][A-Z0-9]+(?:[_-][A-Z0-9]+)*[_-]\d{3}\b/g;

/** Every ID cited in a text, in order. */
export const citedIds = (text: string) => text.match(CASE_ID) ?? [];

/**
 * Rewrites the IDs cited in `text` with `map` (old → new) and removes citations that aren't in
 * `valid`. An ID list in brackets — "(TC_A_001, TC_A_002 and TC_A_003)" — is rebuilt from the
 * surviving IDs (duplicates removed) or dropped when none survive.
 */
export function rewriteCitations(text: string, valid: Set<string>, map?: Map<string, string>): string {
  const fix = (id: string) => {
    const next = map?.get(id) ?? id;
    return valid.has(next) ? next : null;
  };
  const listOnly = /^(?:\s*(?:see\s+)?)?(?:TC[_-][A-Z0-9_-]+\d{3}|[\s,;&]|\band\b)+$/i;
  // One pass over bracketed lists and bare IDs, so a rewritten ID is never rewritten again.
  const token = new RegExp(`\\s*\\(([^()]*)\\)|${CASE_ID.source}`, "g");
  return text
    .replace(token, (whole, inner: string | undefined) => {
      if (inner === undefined) return fix(whole) ?? "";
      const cited = citedIds(inner);
      if (!cited.length) return whole;
      if (!listOnly.test(inner)) return whole.replace(CASE_ID, (id) => fix(id) ?? "");
      const ids = [...new Set(cited.map(fix).filter((x): x is string => x !== null))];
      return ids.length ? ` (${ids.join(", ")})` : "";
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Drops citations of cases that don't exist (e.g. the model cited an ID it never wrote). */
export function pruneCitations(result: GenerationResult): GenerationResult {
  const valid = new Set(result.testCases.map((c) => c.id));
  const fix = (xs: string[]) => xs.map((x) => rewriteCitations(x, valid)).filter((x) => x.trim());
  return { ...result, assumptions: fix(result.assumptions), questions: fix(result.questions) };
}

/** IDs of the cases matching `topic`, in case order (max `limit`). */
export function idsFor(cases: TestCase[], topic: (c: TestCase) => boolean, limit = 4): string[] {
  return cases.filter(topic).slice(0, limit).map((c) => c.id);
}

/** "Question? (TC_A_001, TC_A_002)" — or just the question when nothing matches. */
export const withCitations = (question: string, ids: string[]) => (ids.length ? `${question} (${ids.join(", ")})` : question);
