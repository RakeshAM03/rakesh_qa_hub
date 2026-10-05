import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateChecklist } from "./checklist";
import { citedIds, pruneCitations, rewriteCitations } from "./citations";
import { mergeResults } from "./prompt";
import { validateResult } from "./schema";
import { blankCase, defaultInput, type GenerationResult, type TestCase } from "./types";

const DIR = "tests/fixtures/tcgen/requirements";
const SAMPLES = readdirSync(DIR).filter((f) => f.endsWith(".txt"));

const LOGIN_EXAMPLE = `Users log in with email and password.
AC1: Password must be 8–20 characters.
AC2: After 5 failed attempts the account is locked for 15 minutes.
AC3: Show "Invalid email or password." on wrong credentials.`;

/**
 * What a cited case must be about, per question — written independently of the generator's own
 * matchers so a wrong citation fails here. A question with citations but no rule fails too.
 */
const TOPICS: [question: RegExp, title: (q: RegExpMatchArray) => RegExp][] = [
  [/Is the ([\d.]+ [KMG]B) limit inclusive/, (m) => new RegExp(`\\b${m[1]}\\b.*\\b(exactly|above|below|boundary)\\b|\\b(exactly|above|below)\\b.*\\b${m[1]}\\b`, "i")],
  [/more than one file be attached/, () => /\bmultiple files\b|\breplaces\b/i],
  [/failed-attempt counter/, () => /\b(failed attempts?|attempts?|locked|lockout)\b/i],
  [/Are the (.+?) limits \(/, (m) => new RegExp(`\\b${m[1]}\\b`, "i")],
  [/Is (.+?) uniqueness case-insensitive/, (m) => new RegExp(`\\b${m[1]}\\b.*\\b(already exists|duplicate|existing)\\b|\\b(already exists|duplicate|existing)\\b.*\\b${m[1]}\\b`, "i")],
  [/decimal amounts/, () => /\bamount\b/i],
  [/page size fixed/, () => /\bpagination\b|\bpage size\b/i],
  [/counts as a duplicate/, () => /\bduplicate\b|\bsecond\b/i],
];

function checkCitations(result: GenerationResult) {
  const byId = new Map(result.testCases.map((c) => [c.id, c.title]));
  let cited = 0;
  for (const text of [...result.questions, ...result.assumptions]) {
    const ids = citedIds(text);
    if (!ids.length) continue;
    const rule = TOPICS.map(([q, t]) => [text.match(q), t] as const).find(([m]) => m);
    expect(rule, `no topic rule for: ${text}`).toBeTruthy();
    const topic = rule![1](rule![0]!);
    for (const id of ids) {
      cited++;
      expect(byId.has(id), `${id} cited in "${text}" doesn't exist`).toBe(true);
      expect(byId.get(id), `${id} cited in "${text}"`).toMatch(topic);
    }
  }
  return cited;
}

describe("open questions cite existing, on-topic case IDs", () => {
  it.each(SAMPLES.map((f) => [f]))("checklist: %s", (file) => {
    const { result } = generateChecklist({ ...defaultInput(), requirement: readFileSync(`${DIR}/${file}`, "utf8") });
    expect(checkCitations(result)).toBeGreaterThan(0);
  });

  it.each(["quick", "standard", "exhaustive"] as const)("checklist at %s depth (cases trimmed before numbering)", (depth) => {
    for (const file of SAMPLES) {
      const base = defaultInput();
      const { result } = generateChecklist({ ...base, requirement: readFileSync(`${DIR}/${file}`, "utf8"), options: { ...base.options, depth } });
      checkCitations(result);
    }
  });

  it("the user guide's Login example cites the lockout cases, not 'blocked' boundary cases", () => {
    const base = defaultInput();
    const { result } = generateChecklist({ ...base, requirement: LOGIN_EXAMPLE, context: { ...base.context, moduleName: "Login" } });
    checkCitations(result);
    const lockout = result.questions.find((q) => q.includes("failed-attempt counter"))!;
    expect(lockout).toContain("(TC_LOG_008, TC_LOG_009, TC_LOG_010, TC_LOG_011)");
  });
});

const tc = (id: string, title: string): TestCase => ({ ...blankCase("X", 1), id, title });
const result = (cases: TestCase[], questions: string[], assumptions: string[] = []): GenerationResult => ({ summary: "", requirementRules: [], assumptions, questions, testCases: cases });

describe("AI batches: citations are rewritten after merge, dedupe and renumbering", () => {
  it("maps each batch's IDs to the final numbering, even when batches reuse IDs", () => {
    const merged = mergeResults(
      [
        result([tc("TC_X_001", "Verify A"), tc("TC_X_002", "Verify B")], ["Q about B? (TC_X_002)"]),
        result([tc("TC_X_001", "Verify C"), tc("TC_X_002", "Verify D")], ["Q about D? (TC_X_002)"], ["C assumes … (see TC_X_001)"]),
      ],
      "X",
    );
    expect(merged.testCases.map((c) => [c.id, c.title])).toEqual([
      ["TC_X_001", "Verify A"],
      ["TC_X_002", "Verify B"],
      ["TC_X_003", "Verify C"],
      ["TC_X_004", "Verify D"],
    ]);
    expect(merged.questions).toEqual(["Q about B? (TC_X_002)", "Q about D? (TC_X_004)"]);
    expect(merged.assumptions).toEqual(["C assumes … (TC_X_003)"]);
  });

  it("points a dropped duplicate at the case that was kept, and never rewrites an ID twice", () => {
    const merged = mergeResults(
      [
        result([tc("TC_X_001", "Verify A"), tc("TC_X_002", "Verify B")], []),
        // Batch 2 numbers from 101; its "Verify A" is a duplicate of batch 1's.
        result([tc("TC_X_101", "Verify A"), tc("TC_X_102", "Verify E"), tc("TC_X_001", "Verify F")], ["About A and E? (TC_X_101, TC_X_102)", "About F? (TC_X_001)"]),
      ],
      "X",
    );
    expect(merged.testCases.map((c) => c.id + " " + c.title)).toEqual(["TC_X_001 Verify A", "TC_X_002 Verify B", "TC_X_003 Verify E", "TC_X_004 Verify F"]);
    expect(merged.questions).toEqual(["About A and E? (TC_X_001, TC_X_003)", "About F? (TC_X_004)"]);
  });

  it("removes citations of cases that don't exist", () => {
    const merged = mergeResults([result([tc("TC_X_001", "Verify A")], ["Is A right? (TC_X_001, TC_X_009)", "Ghost? (TC_X_042)"])], "X");
    expect(merged.questions).toEqual(["Is A right? (TC_X_001)", "Ghost?"]);
  });

  it("pasted / AI answers keep only citations of their own cases", () => {
    const out = validateResult(
      {
        testCases: [{ id: "TC_P_001", title: "Verify P", category: "Functional", type: "Positive", priority: "P1", steps: ["a"], expectedResult: "b" }],
        questions: ["Inclusive? (TC_P_001 and TC_P_007)", "See TC_P_005 for details"],
        assumptions: ["Assumed (TC_P_003)"],
      },
      "standard",
    );
    expect(out.ok && out.result.questions).toEqual(["Inclusive? (TC_P_001)", "See for details"]);
    expect(out.ok && out.result.assumptions).toEqual(["Assumed"]);
  });

  it("rewriteCitations and pruneCitations leave other brackets and text alone", () => {
    const valid = new Set(["TC_A_001"]);
    expect(rewriteCitations("Limit (inclusive) for TC_A_001 (max 5)", valid)).toBe("Limit (inclusive) for TC_A_001 (max 5)");
    expect(rewriteCitations("Dup (TC_A_002, TC_A_003)", valid, new Map([["TC_A_002", "TC_A_001"], ["TC_A_003", "TC_A_001"]]))).toBe("Dup (TC_A_001)");
    expect(pruneCitations(result([tc("TC_A_001", "Verify A")], ["(TC_A_999)"])).questions).toEqual([]);
  });
});
