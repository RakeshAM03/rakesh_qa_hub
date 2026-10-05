/**
 * Validation for generated test cases (AI answers, pasted Claude answers and older saved
 * generations), plus the structured-output JSON Schema and API request bodies.
 */

import { z } from "zod";

import { CATEGORIES, newKey, numbered, PRIORITIES, type CaseType, type Category, type GenerationResult, type Priority, type PriorityScheme, type TestCase } from "./types";

export const MAX_CASES = 500;
export const MAX_INPUT_BYTES = 30 * 1024;

const asText = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));

const text = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.map(asText).join("\n");
      if (typeof v === "object") return JSON.stringify(v, null, 2);
      return String(v);
    })
    .pipe(z.string().max(max));

const stripNumber = (s: string) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();

const list = (maxItems: number, maxLen: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return [];
      if (Array.isArray(v)) return v.map((x) => stripNumber(asText(x))).filter(Boolean);
      return String(v)
        .split(/\r?\n/)
        .map(stripNumber)
        .filter(Boolean);
    })
    .pipe(z.array(z.string().max(maxLen)).max(maxItems));

/** List or text → numbered lines ("1. …"). Text that's already one paragraph stays as it is. */
const numberedText = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return "";
      const items = Array.isArray(v)
        ? v.map((x) => stripNumber(asText(x))).filter(Boolean)
        : String(v)
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean);
      if (!items.length) return "";
      if (!Array.isArray(v) && items.length === 1) return items[0];
      return numbered(items.map(stripNumber));
    })
    .pipe(z.string().max(max));

/** Object → "Key: value" lines; list → lines. */
const testDataText = z
  .unknown()
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return "";
    if (Array.isArray(v)) return v.map(asText).join("\n");
    if (typeof v === "object") return Object.entries(v).map(([k, x]) => `${k}: ${asText(x)}`).join("\n");
    return String(v);
  })
  .pipe(z.string().max(5000));

const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.toLowerCase().replace(/[^a-z]/g, ""), c]));

/** New categories pass through; older ones (Non-Functional + type, "Boundary", …) are mapped. */
export function normalizeCategory(category: unknown, type?: unknown): Category {
  const key = String(category ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const direct = CATEGORY_BY_KEY.get(key);
  const t = String(type ?? "").toLowerCase();
  // Older answers put the kind of test in "type" (Boundary, Security…) under a broad category.
  const legacyType = t && !/^(positive|negative)$/.test(t);
  if (direct && !((direct === "Functional" || direct === "API") && legacyType)) return direct;
  if (key === "boundary" || key === "boundaryvalueanalysis" || /boundary/.test(t)) return "Boundary Value";
  if (key.startsWith("api") || key === "apisecurity") return /auth|security|token/.test(t) ? "API / Security" : "API";
  if (/security|auth|injection|xss/.test(t)) return "Security";
  if (/perform|load|stress/.test(t)) return "Performance";
  if (/access|wcag/.test(t)) return "Accessibility";
  if (/compat|browser|device/.test(t)) return "Compatibility";
  if (/reliab|recover|network|timeout/.test(t)) return "Reliability";
  if (/locali|i18n|rtl/.test(t)) return "Localisation";
  if (/usab|ux/.test(t)) return "Usability";
  if (/valid/.test(t)) return "Validation";
  if (key.startsWith("non") || key === "nfr") return "UI";
  if (/integration/.test(key)) return "Integration";
  if (/integrity/.test(key)) return "Data Integrity";
  if (key === "ui" || key === "userinterface") return "UI";
  return direct ?? "Functional";
}

const NEGATIVE_WORDS = /\b(reject|rejected|block|blocked|invalid|error|denied|missing|without|exceed|exceeds|not|cannot|can't|fails?|wrong|unauthori[sz]ed|forbidden|duplicate|expired|locked|empty|blank|spoof|malware|xss|injection)\b/i;

export function normalizeType(type: unknown, title: string): CaseType {
  const t = String(type ?? "").toLowerCase();
  if (t.startsWith("pos")) return "Positive";
  if (t.startsWith("neg")) return "Negative";
  return NEGATIVE_WORDS.test(`${t} ${title}`) ? "Negative" : "Positive";
}

/** Reads a priority in any scheme. Bare "P1"–"P3" are read in the given scheme (P0 scheme shifts by one). */
export function normalizePriority(v: unknown, scheme: PriorityScheme = "standard"): Priority {
  const s = String(v ?? "").trim().toUpperCase();
  if (/CRITICAL|BLOCKER|HIGHEST/.test(s)) return "P1";
  if (/HIGH|MAJOR/.test(s)) return /P1/.test(s) && scheme !== "p0" ? "P1" : "P2";
  if (/MEDIUM|NORMAL|MODERATE/.test(s)) return "P3";
  if (/LOW|MINOR|TRIVIAL/.test(s)) return "P4";
  const m = /^P?([0-4])$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    const level = scheme === "p0" || n === 0 ? n + 1 : n;
    return PRIORITIES[Math.min(3, Math.max(0, level - 1))];
  }
  return "P3";
}

const bool = z
  .unknown()
  .optional()
  .transform((v) => v === true || (typeof v === "string" && /^(true|yes|y|1)$/i.test(v.trim())));

const headers = z
  .unknown()
  .optional()
  .transform((v): Record<string, string> => {
    if (Array.isArray(v)) {
      return Object.fromEntries(
        v
          .filter((h) => h && typeof h === "object")
          .map((h) => [String((h as Record<string, unknown>).name ?? (h as Record<string, unknown>).key ?? ""), String((h as Record<string, unknown>).value ?? "")])
          .filter(([k]) => k),
      );
    }
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
    return {};
  });

const apiSchema = z
  .object({
    method: z.unknown().optional().transform((v) => String(v ?? "GET").toUpperCase().slice(0, 10)),
    endpoint: text(2000),
    headers,
    body: z.unknown().optional(),
    expectedStatus: z
      .unknown()
      .optional()
      .transform((v) => {
        const n = Number(v);
        return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
      }),
    assertions: list(50, 1000),
  })
  .transform((a) => {
    let body = a.body ?? null;
    if (typeof body === "string") {
      const t = body.trim();
      if (!t) body = null;
      else {
        try {
          body = JSON.parse(t);
        } catch {
          // keep as text
        }
      }
    }
    return { ...a, body };
  });

function caseSchema(scheme: PriorityScheme) {
  return z
    .object({
      id: text(60),
      title: text(500).pipe(z.string().min(1, "A test case has no title.")),
      category: z.unknown().optional(),
      type: z.unknown().optional(),
      priority: z.unknown().optional(),
      automation: z.unknown().optional(),
      automationCandidate: z.unknown().optional(),
      preconditions: numberedText(5000),
      testData: testDataText,
      steps: list(60, 2000),
      expectedResult: numberedText(5000),
      gherkin: z
        .unknown()
        .optional()
        .transform((v) => (v === null || v === undefined || String(v).trim() === "" || String(v).trim().toLowerCase() === "null" ? null : String(v)))
        .pipe(z.string().max(10_000).nullable()),
      requirementRef: text(500),
      api: z
        .unknown()
        .optional()
        .transform((v) => (v && typeof v === "object" ? v : null))
        .pipe(apiSchema.nullable()),
      template: z.boolean().optional(),
    })
    .transform((c): TestCase => {
      const category = normalizeCategory(c.category, c.type);
      return {
        key: newKey(),
        id: c.id,
        title: c.title.trim(),
        category,
        type: normalizeType(c.type, c.title),
        priority: normalizePriority(c.priority, scheme),
        automationCandidate: bool.parse(c.automation ?? c.automationCandidate),
        preconditions: c.preconditions,
        steps: c.steps,
        testData: c.testData,
        expectedResult: c.expectedResult,
        gherkin: c.gherkin,
        requirementRef: c.requirementRef,
        api: c.api && (c.api.endpoint || category.startsWith("API")) ? c.api : null,
        ...(c.template ? { template: true } : {}),
      };
    });
}

function resultSchema(scheme: PriorityScheme) {
  return z.object({
    summary: text(5000),
    requirementRules: list(100, 2000),
    assumptions: list(50, 2000),
    questions: list(50, 2000),
    testCases: z.array(caseSchema(scheme)).min(1, "The answer has no test cases.").max(MAX_CASES, `At most ${MAX_CASES} test cases.`),
  });
}

export type ParseOutcome = { ok: true; result: GenerationResult } | { ok: false; error: string };

export function validateResult(raw: unknown, scheme: PriorityScheme = "standard"): ParseOutcome {
  const parsed = resultSchema(scheme).safeParse(raw);
  if (parsed.success) return { ok: true, result: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${issue?.message ?? "The answer doesn't match the expected format."}` };
}

/** Saved / older cases → current shape (lenient; drops rows without a title). */
export function normalizeCases(raw: unknown, scheme: PriorityScheme = "standard"): TestCase[] {
  if (!Array.isArray(raw)) return [];
  const schema = caseSchema(scheme);
  return raw.flatMap((c) => {
    const r = schema.safeParse(c);
    return r.success ? [{ ...r.data, key: typeof (c as { key?: unknown }).key === "string" ? (c as { key: string }).key : r.data.key }] : [];
  });
}

/** JSON Schema for structured output (strict: arrays instead of free-form objects). */
export const AI_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "requirementRules", "assumptions", "questions", "testCases"],
  properties: {
    summary: { type: "string" },
    requirementRules: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    testCases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "category", "type", "priority", "automation", "preconditions", "steps", "testData", "expectedResult", "gherkin", "requirementRef", "api"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          category: { type: "string", enum: [...CATEGORIES] },
          type: { type: "string", enum: ["Positive", "Negative"] },
          priority: { type: "string" },
          automation: { type: "string", enum: ["Yes", "No"] },
          preconditions: { type: "array", items: { type: "string" } },
          steps: { type: "array", items: { type: "string" } },
          testData: { type: "array", items: { type: "string" }, description: '"Key: value" lines' },
          expectedResult: { type: "array", items: { type: "string" } },
          gherkin: { anyOf: [{ type: "string" }, { type: "null" }] },
          requirementRef: { type: "string" },
          api: {
            anyOf: [
              { type: "null" },
              {
                type: "object",
                additionalProperties: false,
                required: ["method", "endpoint", "headers", "body", "expectedStatus", "assertions"],
                properties: {
                  method: { type: "string" },
                  endpoint: { type: "string" },
                  headers: {
                    type: "array",
                    items: { type: "object", additionalProperties: false, required: ["name", "value"], properties: { name: { type: "string" }, value: { type: "string" } } },
                  },
                  body: { type: "string", description: "Request body as JSON text, or empty." },
                  expectedStatus: { anyOf: [{ type: "integer" }, { type: "null" }] },
                  assertions: { type: "array", items: { type: "string" } },
                },
              },
            ],
          },
        },
      },
    },
  },
} as const;

// ---------- API bodies ----------

const contextSchema = z.object({
  moduleName: z.string().max(200),
  appType: z.enum(["Web", "Mobile", "API", "Desktop"]),
  platforms: z.string().max(2000),
  roles: z.string().max(2000),
  rules: z.string().max(10_000),
  outOfScope: z.string().max(10_000),
  navigation: z.string().max(500).default(""),
  elements: z.string().max(2000).default(""),
  environment: z.string().max(200).default(""),
  messages: z.string().max(5000).default(""),
});

const optionsSchema = z.object({
  depth: z.enum(["quick", "standard", "exhaustive"]),
  format: z.enum(["steps", "gherkin", "both"]),
  priorityScheme: z.preprocess((v) => (v === "p" ? "p0" : v), z.enum(["standard", "p0", "hml"])),
  includeTestData: z.boolean(),
  idPrefix: z.string().max(20),
});

const apiFormSchema = z.object({
  method: z.string().max(10),
  endpoint: z.string().max(2000),
  requestBody: z.string().max(20_000),
  responseSample: z.string().max(20_000),
  auth: z.enum(["none", "bearer", "basic", "apikey", "oauth2"]),
  notes: z.string().max(5000),
});

export const inputSchema = z.object({
  requirement: z.string().max(MAX_INPUT_BYTES),
  apiSpec: z.string().max(MAX_INPUT_BYTES),
  apiForm: apiFormSchema,
  context: contextSchema,
  types: z.array(z.string().max(40)).max(40),
  options: optionsSchema,
});

/** Stored cases: already normalised, so validate the shape. */
const storedCase = z.object({
  key: z.string().max(60),
  id: z.string().max(60),
  title: z.string().max(500),
  category: z.enum(CATEGORIES),
  type: z.enum(["Positive", "Negative"]),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  automationCandidate: z.boolean(),
  preconditions: z.string().max(5000),
  steps: z.array(z.string().max(2000)).max(60),
  testData: z.string().max(5000),
  expectedResult: z.string().max(5000),
  gherkin: z.string().max(10_000).nullable(),
  requirementRef: z.string().max(500),
  api: z
    .object({
      method: z.string().max(10),
      endpoint: z.string().max(2000),
      headers: z.record(z.string().max(200), z.string().max(5000)),
      body: z.unknown(),
      expectedStatus: z.number().int().nullable(),
      assertions: z.array(z.string().max(1000)).max(50),
    })
    .nullable(),
  template: z.boolean().optional(),
});

export const generationBody = z.object({
  name: z.string().trim().min(1, "Give the generation a name.").max(200),
  requirement: z.string().max(MAX_INPUT_BYTES),
  apiInput: z.string().max(MAX_INPUT_BYTES * 2).nullable(),
  context: contextSchema,
  options: optionsSchema,
  selectedTypes: z.array(z.string().max(40)).max(40),
  mode: z.enum(["AI", "IMPORTED", "CHECKLIST"]),
  summary: z.string().max(5000).nullable(),
  requirementRules: z.array(z.string().max(2000)).max(100).default([]),
  assumptions: z.array(z.string().max(2000)).max(50),
  questions: z.array(z.string().max(2000)).max(50),
  testCases: z.array(storedCase).max(MAX_CASES),
  createdBy: z.string().trim().max(100).optional(),
});

export const generationPatch = z
  .object({
    name: generationBody.shape.name,
    requirement: generationBody.shape.requirement,
    apiInput: generationBody.shape.apiInput,
    context: contextSchema,
    options: optionsSchema,
    selectedTypes: generationBody.shape.selectedTypes,
    mode: generationBody.shape.mode,
    summary: generationBody.shape.summary,
    requirementRules: z.array(z.string().max(2000)).max(100),
    assumptions: generationBody.shape.assumptions,
    questions: generationBody.shape.questions,
    testCases: generationBody.shape.testCases,
  })
  .partial();
