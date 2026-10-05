/** Checklist mode (no AI): template ideas per selected type, field checks and per-endpoint API cases. */

import { detectFields } from "./fields";
import { endpointsFromApiText, SpecError, type Endpoint, type ParamInfo } from "./openapi";
import { effectivePrefix } from "./prompt";
import { MAX_CASES } from "./schema";
import { fill, TEMPLATES } from "./templates";
import { caseId, newKey, TYPE_BY_ID, type ApiDetails, type Category, type GenerationResult, type Priority, type TcInput, type TestCase } from "./types";

const PER_TYPE = { quick: 1, standard: 3, exhaustive: Infinity } as const;
const PER_FIELD = { quick: 2, standard: 4, exhaustive: Infinity } as const;
const FIELD_TYPES = new Set(["validation", "boundary", "negative", "edge", "security"]);
/** API types answered per endpoint when an API definition is available. */
const ENDPOINT_TYPES = new Set(["status-codes", "request-validation", "api-auth", "pagination", "response-schema"]);
const PAGINATION = /^(page|pagesize|page_size|per_page|limit|offset|size|cursor|sort|sortby|sort_by|order|orderby)$/i;

type Draft = Omit<TestCase, "key" | "id" | "gherkin" | "requirementRef" | "template"> & { gherkin?: string | null };

export function toGherkin(c: Pick<TestCase, "title" | "preconditions" | "steps" | "expectedResult">, feature: string): string {
  const lines = [`Feature: ${feature || "Feature"}`, "", `  Scenario: ${c.title}`];
  if (c.preconditions.trim()) lines.push(`    Given ${c.preconditions.trim()}`);
  c.steps.forEach((s, i) => lines.push(`    ${i === 0 && !c.preconditions.trim() ? "Given" : i === 0 ? "When" : "And"} ${s}`));
  if (c.expectedResult.trim()) lines.push(`    Then ${c.expectedResult.trim()}`);
  return lines.join("\n");
}

function formEndpoint(input: TcInput): Endpoint | null {
  const f = input.apiForm;
  if (!f.endpoint.trim()) return null;
  let sampleBody: unknown = null;
  let bodyFields: ParamInfo[] = [];
  if (f.requestBody.trim()) {
    try {
      sampleBody = JSON.parse(f.requestBody);
      if (sampleBody && typeof sampleBody === "object" && !Array.isArray(sampleBody)) {
        bodyFields = Object.entries(sampleBody).map(([name, v]) => ({ name, in: "body", required: true, type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : Array.isArray(v) ? "array" : typeof v === "object" && v ? "object" : "string" }));
      }
    } catch {
      sampleBody = f.requestBody;
    }
  }
  let path = f.endpoint.trim();
  let server = "";
  try {
    const u = new URL(path);
    path = u.pathname;
    server = u.origin;
  } catch {
    // relative path
  }
  return { method: f.method.toUpperCase(), path, summary: f.notes.trim(), bodyFields, params: [], sampleBody, responses: [], secured: f.auth !== "none", server };
}

const wrongValue = (type: string) => (type === "string" ? 12345 : type === "boolean" ? "not-a-boolean" : type === "array" ? "not-an-array" : type === "object" ? "not-an-object" : "not-a-number");

function endpointCases(e: Endpoint, types: Set<string>): Draft[] {
  const out: Draft[] = [];
  const name = `${e.method} ${e.path}`;
  const okCode = Number(e.responses.find((r) => /^2\d\d$/.test(r.code))?.code ?? (e.method === "POST" ? 201 : e.method === "DELETE" ? 204 : 200));
  const badCode = Number(e.responses.find((r) => r.code === "422")?.code ?? 400);
  const baseHeaders: Record<string, string> = {};
  if (e.sampleBody !== null && e.method !== "GET") baseHeaders["Content-Type"] = "application/json";
  if (e.secured) baseHeaders.Authorization = "Bearer {{token}}";
  const api = (over: Partial<ApiDetails>): ApiDetails => ({
    method: e.method,
    endpoint: e.path,
    headers: { ...baseHeaders },
    body: e.method === "GET" || e.method === "DELETE" ? null : e.sampleBody,
    expectedStatus: okCode,
    assertions: [],
    ...over,
  });
  const make = (type: string, priority: Priority, title: string, steps: string[], expected: string, details: Partial<ApiDetails>, testData = ""): Draft => ({
    title: `${name}: ${title}`,
    category: "API",
    type,
    priority,
    preconditions: e.secured ? "A valid access token for an allowed user." : "",
    testData,
    steps,
    expectedResult: expected,
    automationCandidate: true,
    api: api(details),
  });
  const bodyText = (b: unknown) => (b === null || b === undefined ? "" : JSON.stringify(b, null, 2));

  if (types.has("status-codes")) {
    out.push(make("Status codes", "P0", `valid request returns ${okCode}`, [`Send ${name} with a valid ${e.method === "GET" ? "request" : "body"}`], `Status ${okCode}; the response body matches the documentation.`, { assertions: [`status equals ${okCode}`] }, bodyText(e.sampleBody)));
    for (const r of e.responses.filter((x) => !/^2\d\d$/.test(x.code) && x.code !== "default")) {
      out.push(
        make("Status codes", r.code.startsWith("5") ? "P2" : "P1", `returns ${r.code}${r.description ? ` (${r.description})` : ""}`, [`Send ${name} in the situation that should return ${r.code}${r.description ? `: ${r.description}` : ""}`], `Status ${r.code} with the documented error body.`, {
          expectedStatus: Number(r.code) || null,
          assertions: [`status equals ${r.code}`],
        }),
      );
    }
  }
  if (types.has("request-validation")) {
    for (const f of e.bodyFields.filter((x) => x.required)) {
      const body = e.sampleBody && typeof e.sampleBody === "object" ? { ...(e.sampleBody as Record<string, unknown>) } : {};
      delete body[f.name];
      out.push(make("Request validation", "P1", `missing required field "${f.name}" is rejected`, [`Send ${name} without "${f.name}"`], `Status ${badCode}; the error names "${f.name}".`, { body, expectedStatus: badCode, assertions: [`status equals ${badCode}`, `error mentions ${f.name}`] }, bodyText(body)));
    }
    for (const p of e.params.filter((x) => x.required && x.in === "query")) {
      out.push(make("Request validation", "P1", `missing required query parameter "${p.name}" is rejected`, [`Send ${name} without ?${p.name}=`], `Status ${badCode}; the error names "${p.name}".`, { expectedStatus: badCode, assertions: [`status equals ${badCode}`] }));
    }
    const typed = e.bodyFields[0];
    if (typed) {
      const body = { ...((e.sampleBody as Record<string, unknown>) ?? {}), [typed.name]: wrongValue(typed.type) };
      out.push(make("Request validation", "P2", `wrong type for "${typed.name}" is rejected`, [`Send ${name} with "${typed.name}" as the wrong type (${typed.type} expected)`], `Status ${badCode} with a type error.`, { body, expectedStatus: badCode, assertions: [`status equals ${badCode}`] }, bodyText(body)));
    }
    for (const f of [...e.bodyFields, ...e.params].filter((x) => x.enum?.length)) {
      out.push(make("Request validation", "P2", `invalid value for enum "${f.name}" is rejected`, [`Send ${name} with "${f.name}" = "NOT_A_VALID_VALUE" (allowed: ${f.enum!.join(", ")})`], `Status ${badCode}; the error lists the allowed values.`, { expectedStatus: badCode, assertions: [`status equals ${badCode}`] }));
    }
  }
  if (types.has("api-auth") && e.secured) {
    const noAuth = { ...baseHeaders };
    delete noAuth.Authorization;
    out.push(make("Authentication / authorisation", "P0", "missing token returns 401", [`Send ${name} without an Authorization header`], "Status 401.", { headers: noAuth, expectedStatus: 401, assertions: ["status equals 401"] }));
    out.push(make("Authentication / authorisation", "P0", "invalid or expired token returns 401", [`Send ${name} with a malformed token, then with an expired token`], "Status 401 for both.", { headers: { ...baseHeaders, Authorization: "Bearer invalid-token" }, expectedStatus: 401, assertions: ["status equals 401"] }));
  }
  if (types.has("pagination")) {
    const pageParams = e.params.filter((p) => PAGINATION.test(p.name));
    if (pageParams.length) {
      const names = pageParams.map((p) => p.name).join(", ");
      out.push(make("Pagination, filtering, sorting", "P2", `pagination / sorting via ${names}`, [`Call ${name} with first, middle, last and out-of-range values for ${names}`, "Call with negative / zero / non-numeric values"], "Correct items and totals for valid values; 400 for invalid ones.", { assertions: ["status equals 200"] }));
    }
  }
  if (types.has("response-schema") && e.responses.some((r) => /^2\d\d$/.test(r.code) && r.hasSchema)) {
    out.push(make("Response schema", "P1", "response matches the documented schema", [`Send a valid ${name}`, "Validate the body against the response schema"], "All required fields present with the documented types; no undocumented sensitive fields.", { assertions: [`status equals ${okCode}`, "body matches schema"] }));
  }
  return out;
}

export type ChecklistOutcome = { result: GenerationResult; warnings: string[] };

export function generateChecklist(input: TcInput): ChecklistOutcome {
  const { context: c, options: o } = input;
  const role = c.roles.split(",")[0]?.trim() ?? "";
  const types = new Set(input.types);
  const warnings: string[] = [];
  const drafts: Draft[] = [];

  // API definition (spec / cURL / form) → per-endpoint cases.
  let endpoints: Endpoint[] = [];
  if (input.apiSpec.trim()) {
    try {
      endpoints = endpointsFromApiText(input.apiSpec).endpoints;
      if (!endpoints.length) warnings.push("The API definition has no operations.");
    } catch (e) {
      warnings.push(e instanceof SpecError ? e.message : "Couldn't read the API definition.");
    }
  }
  const form = formEndpoint(input);
  if (form) endpoints.push(form);
  for (const e of endpoints) drafts.push(...endpointCases(e, types));

  // Template ideas per type (endpoint-answered API types are skipped when endpoints exist).
  for (const id of input.types) {
    if (endpoints.length && ENDPOINT_TYPES.has(id)) continue;
    const def = TYPE_BY_ID.get(id);
    if (!def) continue;
    for (const tpl of (TEMPLATES[id] ?? []).slice(0, PER_TYPE[o.depth])) {
      drafts.push({
        title: fill(tpl.title, c.moduleName, role),
        category: def.category as Category,
        type: tpl.type,
        priority: tpl.priority,
        preconditions: def.category === "API" ? "API reachable; valid credentials available." : fill(`{m} is available to {r}.`, c.moduleName, role),
        testData: "",
        steps: tpl.steps.map((s) => fill(s, c.moduleName, role)),
        expectedResult: tpl.expected,
        automationCandidate: Boolean(tpl.automation),
        api: null,
      });
    }
  }

  // Field-specific checks from words found in the requirement.
  if ([...types].some((t) => FIELD_TYPES.has(t))) {
    for (const field of detectFields(`${input.requirement}\n${c.rules}`)) {
      for (const [suffix, data, expected, type, priority] of field.checks.slice(0, PER_FIELD[o.depth])) {
        drafts.push({
          title: `${field.label}: ${suffix}`,
          category: type === "Security" ? "Non-Functional" : "Functional",
          type,
          priority,
          preconditions: fill("{m} form is open.", c.moduleName, role),
          testData: data,
          steps: [`Enter ${field.label.toLowerCase()}: ${data}`, "Submit"],
          expectedResult: expected,
          automationCandidate: priority !== "P3",
          api: null,
        });
      }
    }
  }

  if (drafts.length > MAX_CASES) warnings.push(`Only the first ${MAX_CASES} cases are kept.`);
  const prefix = effectivePrefix(input);
  const testCases: TestCase[] = drafts.slice(0, MAX_CASES).map((d, i) => {
    const tc: TestCase = {
      ...d,
      key: newKey(),
      id: caseId(prefix, i + 1),
      testData: o.includeTestData ? d.testData : "",
      gherkin: null,
      requirementRef: "",
      template: true,
    };
    if (o.format !== "steps") tc.gherkin = toGherkin(tc, c.moduleName);
    return tc;
  });

  const typeCount = input.types.length;
  return {
    result: {
      summary: `Checklist of ${testCases.length} template test ideas for ${c.moduleName.trim() || "the feature"} across ${typeCount} test type${typeCount === 1 ? "" : "s"}${endpoints.length ? ` and ${endpoints.length} API endpoint${endpoints.length === 1 ? "" : "s"}` : ""}. They're generic — review and adapt them to the requirement.`,
      assumptions: ["Generated from built-in templates without AI; requirement wording was only scanned for field names."],
      questions: [],
      testCases,
    },
    warnings,
  };
}
