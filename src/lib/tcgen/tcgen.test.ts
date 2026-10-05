import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { toGherkin } from "./checklist";
import { coverageMatrix, extractCriteria } from "./coverage";
import { FORMAT_EXAMPLES } from "./examples";
import { columnsFor, csvCell, toCsv, toFeatureFile, toMarkdownTable, toPlaygroundRequests, toPostman, toTcLibraryMarkdown } from "./export";
import { extractJson, parseAnswer, parseMarkdownTable, splitSteps } from "./extract";
import { endpointFromCurl, endpointsFromSpec, parseCurl, parseSpecText, sampleFor, shellWords, SpecError } from "./openapi";
import { BATCHES, buildCopyPrompt, buildImprovePrompt, buildUserPrompt, effectivePrefix, mergeResults } from "./prompt";
import { normalizeCases, normalizeCategory, normalizePriority, normalizeType, validateResult } from "./schema";
import { defaultInput, derivePrefix, priorityLabel, type GenerationResult, type TcInput, type TestCase } from "./types";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/fixtures/tcgen", name), "utf8");

const sampleCase = {
  id: "TC_SU_001",
  title: "Verify sign up succeeds with a valid email and password",
  category: "Functional",
  type: "Positive",
  priority: "P1 - Critical",
  automation: "Yes",
  preconditions: ["App is up in QA.", "User is logged out.", "Sign-up page is open.", "No account exists for the email."],
  steps: ["Open sign-up", "Enter email", "Enter password", "Click 'Sign up'", "Refresh and check"],
  testData: ["Email: new.user@example.com", "Password: Str0ng!Pass"],
  expectedResult: ["Account created.", "Message 'Welcome'.", "Persisted after refresh.", "No duplicate."],
  gherkin: null,
  requirementRef: "AC1",
  api: null,
};
const answer = { summary: "Sign-up tests.", requirementRules: ["Password 8–20 characters"], assumptions: ["No social login"], questions: ["Is there a max password length? (TC_SU_001)"], testCases: [sampleCase] };

const input = (over: Partial<TcInput> = {}): TcInput => {
  const d = defaultInput();
  return { ...d, ...over, context: { ...d.context, ...over.context }, options: { ...d.options, ...over.options } };
};

const asCase = (over: Partial<TestCase> = {}): TestCase => {
  const r = validateResult({ testCases: [sampleCase] });
  if (!r.ok) throw new Error(r.error);
  return { ...r.result.testCases[0], ...over };
};

describe("answer validation and normalisation", () => {
  it("reads the Standard Format answer: numbered lists, Key: value test data, Yes/No automation", () => {
    const r = validateResult(answer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.result.testCases[0];
    expect(c).toMatchObject({ category: "Functional", type: "Positive", priority: "P1", automationCandidate: true });
    expect(c.preconditions).toBe("1. App is up in QA.\n2. User is logged out.\n3. Sign-up page is open.\n4. No account exists for the email.");
    expect(c.testData).toBe("Email: new.user@example.com\nPassword: Str0ng!Pass");
    expect(c.expectedResult.split("\n")).toHaveLength(4);
    expect(r.result.requirementRules).toEqual(["Password 8–20 characters"]);
  });

  it("turns an object of test data into Key: value lines", () => {
    const r = validateResult({ testCases: [{ ...sampleCase, testData: { Email: "a@example.com", Size: "5 MB" } }] });
    expect(r.ok && r.result.testCases[0].testData).toBe("Email: a@example.com\nSize: 5 MB");
  });

  it("maps older answers (Non-Functional, P0–P3, Boundary) to the current format", () => {
    expect(normalizeCategory("Non-Functional", "Security")).toBe("Security");
    expect(normalizeCategory("Non-Functional", "Performance")).toBe("Performance");
    expect(normalizeCategory("Functional", "Boundary")).toBe("Boundary Value");
    expect(normalizeCategory("API", "Authentication")).toBe("API / Security");
    expect(normalizeCategory("api / security")).toBe("API / Security");
    expect(normalizeType("Negative", "x")).toBe("Negative");
    expect(normalizeType("Boundary", "Verify a file above 5 MB is rejected")).toBe("Negative");
    expect(normalizeType("", "Verify login works")).toBe("Positive");
    const old = normalizeCases([{ key: "k1", id: "TC-X-001", title: "Old one", category: "Non-Functional", type: "Security", priority: "P0", preconditions: "x", testData: "y", steps: ["a"], expectedResult: "z", gherkin: null, requirementRef: "", automationCandidate: true, api: null }], "standard");
    expect(old[0]).toMatchObject({ key: "k1", category: "Security", type: "Positive", priority: "P1" });
  });

  it("reads priorities in each scheme", () => {
    expect(["P1 - Critical", "P2 - High", "P3 - Medium", "P4 - Low"].map((p) => normalizePriority(p))).toEqual(["P1", "P2", "P3", "P4"]);
    expect(["P0", "P1", "P2", "P3"].map((p) => normalizePriority(p, "p0"))).toEqual(["P1", "P2", "P3", "P4"]);
    expect(["Critical", "High", "Medium", "Low", "??"].map((p) => normalizePriority(p))).toEqual(["P1", "P2", "P3", "P4", "P3"]);
    expect(normalizePriority("P1", "standard")).toBe("P1");
    expect([priorityLabel("P1", "standard"), priorityLabel("P1", "p0"), priorityLabel("P2", "hml"), priorityLabel("P4", "hml")]).toEqual(["P1 - Critical", "P0", "High", "Low"]);
  });

  it("rejects answers without cases or titles", () => {
    expect(validateResult({ testCases: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/no test cases/) });
    expect(validateResult({ testCases: [{ ...sampleCase, title: "" }] })).toMatchObject({ ok: false, error: expect.stringMatching(/testCases.0.title/) });
  });
});

describe("pasted answers", () => {
  it("reads fenced JSON with text around it, and unfenced JSON with braces in strings", () => {
    const r = parseAnswer(`Here you go:\n\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\`\nDone.`);
    expect(r.ok && r.source).toBe("json");
    const tricky = { ...answer, summary: "Covers {curly} and [square]" };
    expect(extractJson(`Sure! ${JSON.stringify(tricky)} {not json}`)).toEqual(tricky);
    expect(parseAnswer(JSON.stringify([sampleCase])).ok).toBe(true);
  });

  it("falls back to a Markdown table", () => {
    const md = "| ID | Title | Priority | Steps | Expected Result |\n|---|---|---|---|---|\n| T-1 | Verify login works | High | 1. Open 2. Enter 3. Submit | Dashboard \\| home<br>Session created |\n";
    expect(parseMarkdownTable(md)![0].expectedResult).toBe("Dashboard | home\nSession created");
    const r = parseAnswer(md);
    expect(r.ok && r.source).toBe("markdown");
    if (r.ok) expect(r.result.testCases[0]).toMatchObject({ priority: "P2", steps: ["Open", "Enter", "Submit"] });
    expect(splitSteps("a; b")).toEqual(["a", "b"]);
    expect(parseAnswer("nothing here")).toMatchObject({ ok: false });
  });
});

describe("prompt builder", () => {
  const i = input({ requirement: "Login with email and password; account locks after 5 failed attempts.", context: { ...defaultInput().context, moduleName: "Login", navigation: "App > Login", messages: "Your account is locked." } });

  it("states the Standard Format rules, coverage rules and 3 multi-domain examples (format, not content)", () => {
    const p = buildCopyPrompt(i);
    expect(p).toContain("THE STANDARD TEST CASE FORMAT");
    expect(p).toContain("testData: NEVER empty");
    expect(p).toContain("steps: 5–10 lines");
    expect(p).toContain("UNIVERSAL COVERAGE RULES");
    expect(p).toContain("exactly at the limit, limit − 1, limit + 1");
    expect(p).toContain("copy the format and depth, NOT the content");
    expect(FORMAT_EXAMPLES.map((e) => e.id)).toEqual(["TC_RU_001", "TC_RU_007", "TC_LGN_004"]);
    for (const e of FORMAT_EXAMPLES) expect(p).toContain(`"id": "${e.id}"`);
    expect(p).toContain("P1 - Critical / P2 - High / P3 - Medium / P4 - Low");
    expect(p).toContain("TC_LOG_001, TC_LOG_002");
    expect(p).toContain("Navigation path: App > Login");
    expect(p).toContain("Known messages:\nYour account is locked.");
    expect(p).toContain("(d) Self-review");
    expect(p).toContain('"requirementRules"');
    expect(p).not.toMatch(/Rakesh|test\.com/);
  });

  it("limits a batch to its categories and gives it its own ID range", () => {
    const p = buildUserPrompt(i, BATCHES[1], 101);
    expect(p).toContain("ONLY in these categories: Boundary Value");
    expect(p).toContain("TC_LOG_101, TC_LOG_102");
    expect(BATCHES.flatMap((b) => b.categories)).toHaveLength(15);
  });

  it("derives the ID prefix from the module or the requirement, unless one is given", () => {
    expect(derivePrefix("Resume Upload")).toBe("RU");
    expect(derivePrefix("Payment")).toBe("PAY");
    expect(derivePrefix("Pay an Invoice")).toBe("PI");
    expect(effectivePrefix(input({ requirement: "Resume upload — only PDF" }))).toBe("RU");
    expect(effectivePrefix(input({ options: { ...defaultInput().options, idPrefix: "cr-1" } }))).toBe("CR1");
  });

  it("the improve prompt lists only the weak rows with their problems", () => {
    const weak = asCase({ id: "TC_X_007", title: "Check upload", testData: "", steps: ["Open", "Click"] });
    const p = buildImprovePrompt(i, [weak]);
    expect(p).toContain("TC_X_007: test data is empty; fewer than 5 steps");
    expect(p).toContain('"title": "Check upload"');
    expect(p).toContain("Keep each case's id");
  });
});

describe("batch merge", () => {
  const batch = (ids: string[], titles: string[], q: string): GenerationResult => ({
    summary: "",
    requirementRules: ["Rule A"],
    assumptions: ["Assume"],
    questions: [q],
    testCases: ids.map((id, n) => asCase({ id, title: titles[n] })),
  });

  it("renumbers, drops duplicate titles and remaps IDs in questions", () => {
    const merged = mergeResults(
      [batch(["TC_LOG_001", "TC_LOG_002"], ["Verify A", "Verify B"], "About TC_LOG_002?"), batch(["TC_LOG_101", "TC_LOG_102"], ["Verify b", "Verify C"], "About TC_LOG_102?")],
      "LOG",
    );
    expect(merged.testCases.map((c) => [c.id, c.title])).toEqual([
      ["TC_LOG_001", "Verify A"],
      ["TC_LOG_002", "Verify B"],
      ["TC_LOG_003", "Verify C"],
    ]);
    expect(merged.questions).toEqual(["About TC_LOG_002?", "About TC_LOG_003?"]);
    expect(merged.requirementRules).toEqual(["Rule A"]);
    expect(merged.assumptions).toEqual(["Assume"]);
  });
});

describe("OpenAPI and cURL", () => {
  it("reads OpenAPI 3 YAML and Swagger 2 JSON", () => {
    const eps = endpointsFromSpec(parseSpecText(fixture("orders-api.yaml")));
    expect(eps.map((e) => `${e.method} ${e.path}`)).toEqual(["GET /orders", "POST /orders", "GET /orders/{orderId}"]);
    expect(eps[1].sampleBody).toEqual({ customerEmail: "user@example.com", quantity: 2, channel: "WEB" });
    const [sw] = endpointsFromSpec(parseSpecText(fixture("swagger2.json")));
    expect(sw.bodyFields.map((f) => f.name)).toEqual(["name", "price"]);
    expect(() => parseSpecText("hello: world")).toThrow(SpecError);
    expect(sampleFor({ type: "string", format: "date" }, (v) => v)).toBe("2026-01-15");
  });

  it("parses cURL commands", () => {
    expect(shellWords(`curl -H 'A: b c' "x\\"y"`)).toEqual(["curl", "-H", "A: b c", 'x"y']);
    const c = parseCurl(`curl -X POST 'https://api.example.com/users' -H 'Authorization: Bearer abc' --data-raw '{"name":"Asha","age":30}'`);
    expect(endpointFromCurl(c)).toMatchObject({ path: "/users", secured: true });
  });
});

describe("coverage", () => {
  it("finds criteria and matches cases by ref", () => {
    const req = "AC1: Valid card payments succeed\nAC2: Declined cards show an error\n- Receipts are emailed";
    expect(extractCriteria(req).map((c) => c.ref)).toEqual(["AC1", "AC2", "AC3"]);
    const rows = coverageMatrix(req, [asCase({ id: "A", requirementRef: "AC1" }), asCase({ id: "B", requirementRef: "ac-2" })]);
    expect(rows.map((r) => r.caseIds)).toEqual([["A"], ["B"], []]);
  });
});

describe("exporters use the standard columns", () => {
  const tricky = asCase({ id: "TC_X_001", title: '=HYPERLINK("x") "quotes", commas', requirementRef: "" });
  const api = asCase({ id: "TC_X_002", category: "API", requirementRef: "", api: { method: "POST", endpoint: "/orders?dry=1", headers: { "Content-Type": "application/json" }, body: { q: 1 }, expectedStatus: 201, assertions: ["status 201"] } });

  it("CSV: BOM, standard column order, formula escaping; ref column only when used", () => {
    const csv = toCsv([tricky], "standard");
    expect(csv.startsWith("﻿ID,Title,Category,Type,Priority,Automation,Preconditions,Steps,Test data,Expected result\r\n")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"") ""quotes"", commas"`);
    expect(csv).toContain(",P1 - Critical,Yes,");
    expect(columnsFor([asCase()])).toContain("Requirement ref");
    expect(csvCell("-1")).toBe(`"'-1"`);
  });

  it("Markdown, Gherkin, Postman, API Playground and TC Library", () => {
    expect(toMarkdownTable([tricky], "p0")).toContain("| ID | Title | Category | Type | Priority | Automation |");
    expect(toMarkdownTable([tricky], "p0")).toContain("| P0 | Yes |");
    const f = toFeatureFile([tricky, api], "Checkout");
    expect(f).toContain("Feature: Checkout — Functional");
    expect(f).toContain("@TC_X_001 @P1 @positive @automation");
    expect(toGherkin(tricky, "F")).toMatch(/Scenario: =HYPERLINK.*\n\s+Given App is up in QA\./);
    const p = JSON.parse(toPostman([tricky, api], "Orders"));
    expect(p.item).toHaveLength(1);
    expect(p.item[0].event[0].script.exec.join("\n")).toContain("pm.response.to.have.status(201)");
    expect(toPlaygroundRequests([api])[0]).toMatchObject({ url: "{{baseUrl}}/orders?dry=1", assertions: [{ expected: "201" }] });
    expect(toTcLibraryMarkdown("Checkout", answer as unknown as GenerationResult, [tricky], "standard")).toContain("## Test cases (1)");
  });
});
