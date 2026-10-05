/**
 * Checklist mode (no AI): rule extractor + generic generators → cases in the Standard Test Case
 * Format. Domain-agnostic: generators react to what the requirement contains.
 */

import { idsFor, pruneCitations, withCitations } from "./citations";
import { apiCases, apiEndpoints } from "./generators/api";
import { authCases } from "./generators/auth";
import { finalize, makeCtx, type Draft } from "./generators/common";
import { crossCases, templateCase } from "./generators/cross";
import { crudCases, roleCases, searchCases, workflowCases } from "./generators/domain";
import { fieldCases } from "./generators/fields";
import { fileCases } from "./generators/files";
import { allowedValueCases, limitCases } from "./generators/values-limits";
import { describeBytes, extractRequirement, type Requirement } from "./requirement";
import { MAX_CASES } from "./schema";
import { DEPTHS, derivePrefix, TYPE_BY_ID, type GenerationResult, type TcInput, type TestCase } from "./types";

export function toGherkin(c: Pick<TestCase, "title" | "preconditions" | "steps" | "expectedResult">, feature: string): string {
  const strip = (s: string) => s.replace(/^\s*\d+[.)]\s*/, "").trim();
  const pre = c.preconditions.split("\n").map(strip).filter(Boolean);
  const exp = c.expectedResult.split("\n").map(strip).filter(Boolean);
  const out = [`Feature: ${feature || "Feature"}`, "", `  Scenario: ${c.title}`];
  pre.forEach((p, i) => out.push(`    ${i === 0 ? "Given" : "And"} ${p}`));
  c.steps.forEach((s, i) => out.push(`    ${i === 0 ? (pre.length ? "When" : "Given") : "And"} ${strip(s)}`));
  exp.forEach((e, i) => out.push(`    ${i === 0 ? "Then" : "And"} ${e}`));
  return out.join("\n");
}

const PRIORITY_RANK = { P1: 0, P2: 1, P3: 2, P4: 3 } as const;

/** Removes the lowest-priority cases (non-essential first, from the end) until `max` remain. */
function trim(drafts: Draft[], max: number, allowEssential: boolean): Draft[] {
  const keep = [...drafts];
  const drop = (pred: (d: Draft) => boolean) => {
    for (const rank of [3, 2, 1, 0]) {
      for (let i = keep.length - 1; i >= 0 && keep.length > max; i--) {
        if (PRIORITY_RANK[keep[i].priority] === rank && pred(keep[i])) keep.splice(i, 1);
      }
    }
  };
  drop((d) => !d.essential);
  if (allowEssential) drop(() => true);
  return keep;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s: string) => new RegExp(`\\b${escapeRe(s)}\\b`, "i");
const hasNumber = (title: string, n: number) => new RegExp(`(^|[^\\d.,])${n}(?![\\d])`).test(title.replace(/(\d),(?=\d)/g, "$1"));

/**
 * Open questions, built after the cases have their final IDs. Each question cites only cases on
 * its own topic (matched on whole words, so "blocked" isn't a lockout case).
 */
function questions(req: Requirement, cases: TestCase[]): string[] {
  const ask = (q: string, topic: (title: string) => boolean, limit = 4) => withCitations(q, idsFor(cases, (c) => topic(c.title), limit));
  const out: string[] = [];
  const size = req.limits.find((l) => l.kind === "size");
  if (size?.max) {
    const label = describeBytes(size.max);
    out.push(ask(`Is the ${label} limit inclusive, and is it measured in binary (${size.max.toLocaleString("en-US")} bytes) or decimal units?`, (t) => t.includes(label) && /\b(exactly|above|below|boundary|max [+−-] 1)\b/i.test(t)));
  }
  if (req.features.files) out.push(ask("Can more than one file be attached, and should a new upload replace the existing one?", (t) => /\bmultiple files\b|\breplaces?\b/i.test(t)));
  if (req.lockout) out.push(ask("Is the failed-attempt counter per account or per device / IP, and does it reset after a successful login?", (t) => /\b(failed attempts?|attempts?|locked|lockout)\b/i.test(t)));
  for (const l of req.limits.filter((x) => x.kind === "length" || x.kind === "range")) {
    const bounds = [l.min, l.max].flatMap((n) => (n === undefined ? [] : [n - 1, n, n + 1]));
    const range = l.min !== undefined && l.max !== undefined ? `${l.min} to ${l.max}` : l.max !== undefined ? `max ${l.max}` : `min ${l.min}`;
    out.push(ask(`Are the ${l.subject} limits (${range}) inclusive?`, (t) => word(l.subject).test(t) && (bounds.some((n) => hasNumber(t, n)) || /\bbeyond the limit\b/i.test(t)), 6));
  }
  for (const f of req.fields.filter((x) => x.unique)) out.push(ask(`Is ${f.name} uniqueness case-insensitive?`, (t) => word(f.name).test(t) && /\b(already exists|duplicate|existing)\b/i.test(t)));
  if (req.limits.some((l) => l.kind === "amount")) out.push(ask("Are decimal amounts allowed, and how many decimal places?", (t) => /\bamount\b/i.test(t)));
  if (req.limits.some((l) => l.kind === "perPage")) out.push(ask("Is the page size fixed, or can the user change it?", (t) => /\bpagination\b|\bpage size\b/i.test(t)));
  if (req.duplicate) out.push(ask(`What exactly counts as a duplicate ${req.duplicate.subject} (same amount, same method, within a time window)?`, (t) => /\bduplicate\b|\bsecond\b/i.test(t)));
  if (req.features.api && !req.statusCodes.length) out.push("Which status codes and error format should the endpoint return?");
  out.push("What exact success and error messages should be shown (UI copy deck)?");
  return out;
}

export type ChecklistOutcome = { result: GenerationResult; warnings: string[]; requirement: Requirement };

export function generateChecklist(input: TcInput): ChecklistOutcome {
  const apiText = `${input.apiSpec}\n${input.apiForm.endpoint ? `${input.apiForm.method} ${input.apiForm.endpoint}` : ""}`;
  const req = extractRequirement(input.requirement, input.context, apiText);
  if (input.apiSpec.trim() || input.apiForm.endpoint.trim()) req.features.api = true;
  const ctx = makeCtx(req, input);
  const depth = input.options.depth;
  const warnings: string[] = [];
  let drafts: Draft[] = [];

  for (const list of req.lists) drafts.push(...allowedValueCases(ctx, list));
  for (const limit of req.limits) drafts.push(...limitCases(ctx, limit));
  if (req.features.auth) drafts.push(...authCases(ctx, depth));
  if (req.features.files) drafts.push(...fileCases(ctx, depth));
  const apiOnly = req.features.api && !req.features.form && !req.features.files && !req.features.search;
  if (!apiOnly) for (const f of req.fields) drafts.push(...fieldCases(ctx, f, depth));
  drafts.push(...crudCases(ctx), ...searchCases(ctx), ...workflowCases(ctx), ...roleCases(ctx));
  if (req.features.api) {
    const { endpoints, warnings: w } = apiEndpoints(ctx);
    warnings.push(...w);
    for (const e of endpoints) drafts.push(...apiCases(ctx, e));
  }
  drafts.push(...crossCases(ctx));

  // Selected test types, then templates for selected types nothing covered.
  const selected = new Set(input.types);
  drafts = drafts.filter((d) => d.tags.some((t) => selected.has(t)));
  const applicable = (t: string) => {
    const group = TYPE_BY_ID.get(t)?.group;
    if (group === "API") return req.features.api;
    if (["usability", "accessibility", "compatibility", "localisation"].includes(t)) return !apiOnly;
    if (t === "roles") return req.roles.length > 0 || input.context.roles.trim() !== "";
    if (t === "validation") return !apiOnly;
    return true;
  };
  for (const t of input.types) {
    if (applicable(t) && !drafts.some((d) => d.tags.includes(t))) {
      const tpl = templateCase(ctx, t);
      if (tpl) drafts.push(tpl);
    }
  }

  // No duplicates.
  const seen = new Set<string>();
  drafts = drafts.filter((d) => {
    const k = d.title.toLowerCase().replace(/\s+/g, " ").trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const target = DEPTHS.find((d) => d.value === depth)!;
  drafts = trim(drafts, Math.min(target.max, MAX_CASES), depth === "quick");
  if (drafts.length < target.min) warnings.push(`The requirement gave enough material for ${drafts.length} cases — fewer than the ${target.label} target (${target.target}). Add rules, fields or context for more, or pick Quick depth.`);

  const prefix = (input.options.idPrefix.trim() || derivePrefix(req.moduleName)).toUpperCase().replace(/[^A-Z0-9]/g, "") || "TC";
  const testCases = finalize(ctx, drafts, prefix, input.options.includeTestData);
  if (input.options.format !== "steps") for (const c of testCases) c.gherkin = toGherkin(c, req.moduleName);

  return {
    requirement: req,
    warnings,
    result: pruneCitations({
      summary: `${testCases.length} test cases for ${req.moduleName} in the Standard Test Case Format, built from ${req.rules.length} rule${req.rules.length === 1 ? "" : "s"} found in the requirement (no AI). Review the assumptions and open questions before running them.`,
      requirementRules: req.rules,
      assumptions: [...ctx.assumptions, "Generated by the rule-based checklist (no AI): review wording and replace placeholders with the real screen and element names."],
      questions: questions(req, testCases),
      testCases,
    }),
  };
}
