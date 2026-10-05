/**
 * Validation for generated test cases (AI answers and pasted Claude answers), plus the
 * structured-output JSON Schema and API request bodies.
 */

import { z } from "zod";

import { newKey, PRIORITIES, type Category, type GenerationResult, type Priority, type TestCase } from "./types";

export const MAX_CASES = 500;
export const MAX_INPUT_BYTES = 30 * 1024;

const text = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return "";
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("\n");
      if (typeof v === "object") return JSON.stringify(v, null, 2);
      return String(v);
    })
    .pipe(z.string().max(max));

const list = (maxItems: number, maxLen: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined) return [];
      if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x : JSON.stringify(x)).trim()).filter(Boolean);
      return String(v)
        .split(/\r?\n/)
        .map((s) => s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
        .filter(Boolean);
    })
    .pipe(z.array(z.string().max(maxLen)).max(maxItems));

export function normalizeCategory(v: unknown): Category {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s.startsWith("non") || s === "nfr" || ["performance", "security", "usability", "accessibility", "compatibility", "reliability", "localisation", "localization"].includes(s)) return "Non-Functional";
  if (s === "api" || s.startsWith("api")) return "API";
  return "Functional";
}

export function normalizePriority(v: unknown): Priority {
  const s = String(v ?? "").trim().toUpperCase();
  if ((PRIORITIES as string[]).includes(s)) return s as Priority;
  if (/^(P?0|CRITICAL|BLOCKER|HIGHEST)$/.test(s)) return "P0";
  if (/^(P?1|HIGH|MAJOR)$/.test(s)) return "P1";
  if (/^(P?2|MEDIUM|NORMAL|MODERATE)$/.test(s)) return "P2";
  if (/^(P?3|LOW|MINOR|TRIVIAL|LOWEST)$/.test(s)) return "P3";
  return "P2";
}

const bool = z.unknown().optional().transform((v) => v === true || (typeof v === "string" && /^(true|yes|y|1)$/i.test(v.trim())));

const headers = z.unknown().optional().transform((v): Record<string, string> => {
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
    headers: headers.optional().default({}),
    body: z.unknown().optional(),
    expectedStatus: z.unknown().optional().transform((v) => {
      const n = Number(v);
      return Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
    }),
    assertions: list(50, 1000).optional().default([]),
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

export const testCaseSchema = z
  .object({
    id: text(60),
    title: text(500).pipe(z.string().min(1, "A test case has no title.")),
    category: z.unknown().optional().transform(normalizeCategory),
    type: text(80),
    priority: z.unknown().optional().transform(normalizePriority),
    preconditions: text(5000).optional().default(""),
    testData: text(5000).optional().default(""),
    steps: list(60, 2000).optional().default([]),
    expectedResult: text(5000).optional().default(""),
    gherkin: z
      .unknown()
      .optional()
      .transform((v) => (v === null || v === undefined || String(v).trim() === "" || String(v).trim().toLowerCase() === "null" ? null : String(v)))
      .pipe(z.string().max(10_000).nullable()),
    requirementRef: text(500).optional().default(""),
    automationCandidate: bool.optional().default(false),
    api: z
      .unknown()
      .optional()
      .transform((v) => (v && typeof v === "object" ? v : null))
      .pipe(apiSchema.nullable())
      .optional()
      .default(null),
    template: z.boolean().optional(),
  })
  .transform(
    (c): TestCase => ({
      key: newKey(),
      ...c,
      type: c.type || (c.category === "API" ? "API" : "Positive"),
      api: c.api && (c.api.endpoint || c.category === "API") ? c.api : null,
    }),
  );

export const resultSchema = z.object({
  summary: text(5000).optional().default(""),
  assumptions: list(50, 2000).optional().default([]),
  questions: list(50, 2000).optional().default([]),
  testCases: z.array(testCaseSchema).min(1, "The answer has no test cases.").max(MAX_CASES, `At most ${MAX_CASES} test cases.`),
});

export type ParseOutcome = { ok: true; result: GenerationResult } | { ok: false; error: string };

export function validateResult(raw: unknown): ParseOutcome {
  const parsed = resultSchema.safeParse(raw);
  if (parsed.success) return { ok: true, result: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
  return { ok: false, error: `${where}${issue?.message ?? "The answer doesn't match the expected format."}` };
}

/** JSON Schema for structured output (strict: arrays instead of free-form objects). */
export const AI_RESULT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "assumptions", "questions", "testCases"],
  properties: {
    summary: { type: "string" },
    assumptions: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    testCases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "category", "type", "priority", "preconditions", "testData", "steps", "expectedResult", "gherkin", "requirementRef", "automationCandidate", "api"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          category: { type: "string", enum: ["Functional", "Non-Functional", "API"] },
          type: { type: "string" },
          priority: { type: "string", enum: ["P0", "P1", "P2", "P3"] },
          preconditions: { type: "string" },
          testData: { type: "string" },
          steps: { type: "array", items: { type: "string" } },
          expectedResult: { type: "string" },
          gherkin: { anyOf: [{ type: "string" }, { type: "null" }] },
          requirementRef: { type: "string" },
          automationCandidate: { type: "boolean" },
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
});

const optionsSchema = z.object({
  depth: z.enum(["quick", "standard", "exhaustive"]),
  format: z.enum(["steps", "gherkin", "both"]),
  priorityScheme: z.enum(["p", "hml"]),
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

/** Stored cases: already normalised, so validate the shape strictly-ish. */
const storedCase = z.object({
  key: z.string().max(60),
  id: z.string().max(60),
  title: z.string().max(500),
  category: z.enum(["Functional", "Non-Functional", "API"]),
  type: z.string().max(80),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  preconditions: z.string().max(5000),
  testData: z.string().max(5000),
  steps: z.array(z.string().max(2000)).max(60),
  expectedResult: z.string().max(5000),
  gherkin: z.string().max(10_000).nullable(),
  requirementRef: z.string().max(500),
  automationCandidate: z.boolean(),
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
  assumptions: z.array(z.string().max(2000)).max(50),
  questions: z.array(z.string().max(2000)).max(50),
  testCases: z.array(storedCase).max(MAX_CASES),
  createdBy: z.string().trim().max(100).optional(),
});

export const generationPatch = generationBody.omit({ createdBy: true }).partial();
