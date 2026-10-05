/** Acceptance criteria in a requirement, and which test cases cover each one. */

import type { TestCase } from "./types";

export type Criterion = { ref: string; text: string };
export type CoverageRow = Criterion & { caseIds: string[] };

const AC = /^\s*(?:[-*•]\s*)?\**\s*(AC[\s-]?(\d+))\s*\**\s*[:.)-]?\s*(.*)$/i;
const NUMBERED = /^\s*(\d+)[.)]\s+(.+)$/;
const BULLET = /^\s*[-*•]\s+(.+)$/;
const GHERKIN = /^\s*(Given|When|Then|And|But)\b/i;

/**
 * Finds criteria: "AC1: …" lines, numbered / bulleted lines, and Given/When/Then blocks
 * (one block = one criterion). Refs are "AC<n>" (explicit numbers kept).
 */
export function extractCriteria(requirement: string): Criterion[] {
  const out: Criterion[] = [];
  let block: string[] = [];
  const flush = () => {
    if (block.length) out.push({ ref: "", text: block.join(" ") });
    block = [];
  };
  for (const line of requirement.split(/\r?\n/)) {
    const ac = AC.exec(line);
    if (ac) {
      flush();
      out.push({ ref: `AC${ac[2]}`, text: ac[3].trim() || line.trim() });
      continue;
    }
    if (GHERKIN.test(line)) {
      if (/^\s*Given\b/i.test(line)) flush();
      block.push(line.trim());
      continue;
    }
    flush();
    const n = NUMBERED.exec(line) ?? BULLET.exec(line);
    if (n) out.push({ ref: "", text: (n[2] ?? n[1]).trim() });
  }
  flush();
  const used = new Set(out.filter((c) => c.ref).map((c) => c.ref.toUpperCase()));
  let next = 1;
  return out
    .filter((c) => c.text.length > 3)
    .map((c) => {
      if (c.ref) return c;
      while (used.has(`AC${next}`)) next++;
      used.add(`AC${next}`);
      return { ...c, ref: `AC${next++}` };
    });
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);

/** Does a case's requirementRef point at this criterion? (ref label, or most of its words). */
export function covers(tc: Pick<TestCase, "requirementRef">, c: Criterion): boolean {
  const ref = tc.requirementRef.trim();
  if (!ref) return false;
  if (new RegExp(`\\b${c.ref.replace(/(\d+)/, "[\\s-]?$1")}\\b`, "i").test(ref)) return true;
  const cw = words(c.text);
  if (cw.size < 2) return false;
  const rw = words(ref);
  let hit = 0;
  for (const w of cw) if (rw.has(w)) hit++;
  return hit / cw.size >= 0.6;
}

export function coverageMatrix(requirement: string, cases: TestCase[]): CoverageRow[] {
  return extractCriteria(requirement).map((c) => ({ ...c, caseIds: cases.filter((tc) => covers(tc, c)).map((tc) => tc.id) }));
}
