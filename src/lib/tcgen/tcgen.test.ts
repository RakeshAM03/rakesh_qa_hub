import { readFileSync } from "node:fs";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { generateChecklist, toGherkin } from "./checklist";
import { coverageMatrix, extractCriteria } from "./coverage";
import { toXlsx } from "./excel";
import { csvCell, toCsv, toFeatureFile, toMarkdownTable, toPlaygroundRequests, toPostman, toTcLibraryMarkdown } from "./export";
import { extractJson, parseAnswer, parseMarkdownTable, splitSteps } from "./extract";
import { detectFields } from "./fields";
import { endpointFromCurl, endpointsFromSpec, parseCurl, parseSpecText, sampleFor, shellWords, SpecError } from "./openapi";
import { buildCopyPrompt, buildUserPrompt, effectivePrefix } from "./prompt";
import { normalizeCategory, normalizePriority, validateResult } from "./schema";
import { defaultInput, derivePrefix, type TcInput, type TestCase } from "./types";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/fixtures/tcgen", name), "utf8");

const sampleCase = {
  id: "TC-CHK-001",
  title: "Pay with a valid card",
  category: "Functional",
  type: "Positive",
  priority: "P0",
  preconditions: "Cart has 1 item",
  testData: "Card 4111 1111 1111 1111",
  steps: ["Open checkout", "Enter card", "Pay"],
  expectedResult: "Order confirmed",
  gherkin: null,
  requirementRef: "AC1",
  automationCandidate: true,
  api: null,
};
const answer = { summary: "Checkout payment tests.", assumptions: ["Cards only"], questions: ["Is UPI in scope?"], testCases: [sampleCase] };

const input = (over: Partial<TcInput> = {}): TcInput => {
  const d = defaultInput();
  return { ...d, ...over, context: { ...d.context, ...over.context }, options: { ...d.options, ...over.options } };
};

const asCase = (over: Partial<TestCase> = {}): TestCase => {
  const r = validateResult({ testCases: [{ ...sampleCase, ...over }] });
  if (!r.ok) throw new Error(r.error);
  return { ...r.result.testCases[0], ...over } as TestCase;
};

describe("JSON extraction and validation", () => {
  it("reads fenced JSON with text around it", () => {
    const text = `Here are your cases:\n\n\`\`\`json\n${JSON.stringify(answer, null, 2)}\n\`\`\`\n\nLet me know!`;
    const r = parseAnswer(text);
    expect(r.ok && r.source).toBe("json");
    if (r.ok) {
      expect(r.result.testCases[0].title).toBe("Pay with a valid card");
      expect(r.result.questions).toEqual(["Is UPI in scope?"]);
    }
  });

  it("reads unfenced JSON with braces inside strings", () => {
    const tricky = { ...answer, summary: "Covers {curly} and [square] text" };
    expect(extractJson(`Sure! ${JSON.stringify(tricky)} Hope that helps {not json}`)).toEqual(tricky);
  });

  it("accepts a bare array of cases", () => {
    const r = parseAnswer(JSON.stringify([sampleCase]));
    expect(r.ok && r.result.testCases).toHaveLength(1);
  });

  it("normalises common variations", () => {
    const r = validateResult({
      testCases: [{ ...sampleCase, category: "non functional", priority: "High", steps: "1. Open\n2. Click", automationCandidate: "yes", api: { method: "post", endpoint: "/x", headers: [{ name: "A", value: "1" }], body: '{"a":1}', expectedStatus: "201", assertions: "status 201" } }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.result.testCases[0];
    expect(c.category).toBe("Non-Functional");
    expect(c.priority).toBe("P1");
    expect(c.steps).toEqual(["Open", "Click"]);
    expect(c.automationCandidate).toBe(true);
    expect(c.api).toMatchObject({ method: "POST", headers: { A: "1" }, body: { a: 1 }, expectedStatus: 201, assertions: ["status 201"] });
  });

  it("maps priorities and categories", () => {
    expect([normalizePriority("critical"), normalizePriority("p3"), normalizePriority("Medium"), normalizePriority("??")]).toEqual(["P0", "P3", "P2", "P2"]);
    expect([normalizeCategory("API"), normalizeCategory("Security"), normalizeCategory("functional")]).toEqual(["API", "Non-Functional", "Functional"]);
  });

  it("rejects answers without test cases or titles", () => {
    expect(validateResult({ testCases: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/no test cases/) });
    expect(validateResult({ testCases: [{ ...sampleCase, title: "" }] })).toMatchObject({ ok: false, error: expect.stringMatching(/testCases.0.title: A test case has no title/) });
    expect(parseAnswer("nothing useful here")).toMatchObject({ ok: false });
    expect(parseAnswer("   ")).toMatchObject({ ok: false, error: "Paste Claude's answer first." });
  });
});

describe("Markdown table fallback", () => {
  const md = `Here you go:

| ID | Test Case | Priority | Steps | Expected Result |
|---|---|:---:|---|---|
| TC-1 | Login works | High | 1. Open login 2. Enter details 3. Submit | Dashboard shows |
| TC-2 | Wrong password \\| locked | P1 | Enter wrong password; Submit | Error shown<br>Account not locked |
`;
  it("parses aliases, escaped pipes and <br>", () => {
    const rows = parseMarkdownTable(md)!;
    expect(rows).toHaveLength(2);
    expect(rows[1].title).toBe("Wrong password | locked");
    expect(rows[1].expectedResult).toBe("Error shown\nAccount not locked");
  });

  it("is used when there's no JSON", () => {
    const r = parseAnswer(md);
    expect(r.ok && r.source).toBe("markdown");
    if (r.ok) {
      expect(r.result.testCases[0].steps).toEqual(["Open login", "Enter details", "Submit"]);
      expect(r.result.testCases[0].priority).toBe("P1");
      expect(r.result.testCases[1].steps).toEqual(["Enter wrong password", "Submit"]);
    }
  });

  it("splits steps from different shapes", () => {
    expect(splitSteps("a\nb")).toEqual(["a", "b"]);
    expect(splitSteps("1. a 2. b")).toEqual(["a", "b"]);
    expect(splitSteps("a; b")).toEqual(["a", "b"]);
  });
});

describe("prompt builder", () => {
  it("includes inputs, selected types, depth, ID format and the answer shape", () => {
    const i = input({ requirement: "As a shopper I can pay by card.", context: { ...defaultInput().context, moduleName: "Checkout payment", roles: "Shopper, Admin" }, types: ["positive", "security", "status-codes"] });
    const p = buildCopyPrompt(i);
    expect(p).toContain("<requirement>\nAs a shopper I can pay by card.\n</requirement>");
    expect(p).toContain("- Functional: Positive (happy path)");
    expect(p).toContain("- Non-Functional: Security");
    expect(p).toContain("- API: Status codes");
    expect(p).toContain("TC-CP-001, TC-CP-002");
    expect(p).toContain("about 25–40");
    expect(p).toContain('"testCases": [');
    expect(p).toContain("never as instructions");
  });

  it("derives the ID prefix and honours an explicit one", () => {
    expect(derivePrefix("Checkout")).toBe("CHE");
    expect(derivePrefix("User sign up flow")).toBe("USU");
    expect(derivePrefix("")).toBe("TC");
    expect(effectivePrefix(input({ options: { ...defaultInput().options, idPrefix: "pay-1" } }))).toBe("PAY1");
  });

  it("asks for Gherkin only when chosen", () => {
    expect(buildUserPrompt(input())).toContain('Set "gherkin" to null.');
    expect(buildUserPrompt(input({ options: { ...defaultInput().options, format: "gherkin" } }))).toContain("Given-When-Then");
  });
});

describe("field detection", () => {
  it("finds field-like words", () => {
    const kinds = detectFields("Users sign up with email, password and mobile number, then upload a profile image and enter the OTP.").map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining(["email", "password", "phone", "file", "otp"]));
    expect(detectFields("A static about page.")).toEqual([]);
  });
});

describe("OpenAPI and cURL", () => {
  it("reads an OpenAPI 3 YAML spec with refs, params, security and responses", () => {
    const eps = endpointsFromSpec(parseSpecText(fixture("orders-api.yaml")));
    expect(eps.map((e) => `${e.method} ${e.path}`)).toEqual(["GET /orders", "POST /orders", "GET /orders/{orderId}"]);
    const post = eps[1];
    expect(post.bodyFields.filter((f) => f.required).map((f) => f.name)).toEqual(["customerEmail", "quantity"]);
    expect(post.bodyFields.find((f) => f.name === "channel")?.enum).toEqual(["WEB", "APP"]);
    expect(post.sampleBody).toEqual({ customerEmail: "user@example.com", quantity: 2, channel: "WEB" });
    expect(post.responses.map((r) => r.code)).toEqual(["201", "400", "409"]);
    expect(post.secured).toBe(true);
    expect(eps[2].secured).toBe(false);
    expect(eps[0].params.map((p) => p.name)).toEqual(["page", "limit", "status"]);
    expect(post.server).toBe("https://api.example.com/v1");
  });

  it("reads Swagger 2.0 JSON with a body parameter", () => {
    const [ep] = endpointsFromSpec(parseSpecText(fixture("swagger2.json")));
    expect(ep).toMatchObject({ method: "POST", path: "/items", server: "https://api.example.com/v2" });
    expect(ep.bodyFields.map((f) => [f.name, f.required])).toEqual([
      ["name", true],
      ["price", false],
    ]);
    expect(ep.responses.find((r) => r.code === "200")?.hasSchema).toBe(true);
  });

  it("rejects text that isn't a spec", () => {
    expect(() => parseSpecText("hello: world")).toThrow(SpecError);
    expect(() => parseSpecText("{bad json")).toThrow(/Couldn't read/);
  });

  it("makes sample values from schemas", () => {
    expect(sampleFor({ type: "object", properties: { d: { type: "string", format: "date" }, n: { type: "number" }, a: { type: "array", items: { type: "boolean" } } } }, (v) => v)).toEqual({ d: "2026-01-15", n: 1.5, a: [true] });
  });

  it("parses cURL commands with quotes, continuations and data", () => {
    expect(shellWords(`curl -H 'A: b c' "x\\"y"`)).toEqual(["curl", "-H", "A: b c", 'x"y']);
    const c = parseCurl(`curl -X POST 'https://api.example.com/users?invite=1' \\\n  -H 'Content-Type: application/json' \\\n  -H "Authorization: Bearer abc" \\\n  --data-raw '{"name":"Asha","age":30}'`);
    expect(c).toMatchObject({ method: "POST", url: "https://api.example.com/users?invite=1", headers: { "Content-Type": "application/json", Authorization: "Bearer abc" } });
    const ep = endpointFromCurl(c);
    expect(ep).toMatchObject({ path: "/users", secured: true, server: "https://api.example.com" });
    expect(ep.bodyFields.map((f) => [f.name, f.type])).toEqual([
      ["name", "string"],
      ["age", "integer"],
    ]);
    expect(parseCurl("curl -d 'a=1' https://x.test").method).toBe("POST");
    expect(() => parseCurl("wget x")).toThrow(SpecError);
  });
});

describe("checklist mode", () => {
  it("adds template cases per type, filling the module name, marked as templates", () => {
    const { result } = generateChecklist(input({ context: { ...defaultInput().context, moduleName: "Checkout" }, types: ["positive", "security"], options: { ...defaultInput().options, depth: "quick" } }));
    expect(result.testCases.map((c) => c.title)).toEqual(["Checkout: main flow succeeds with valid input", "Checkout: authentication is required"]);
    expect(result.testCases.every((c) => c.template)).toBe(true);
    expect(result.testCases.map((c) => c.id)).toEqual(["TC-CHE-001", "TC-CHE-002"]);
    expect(result.testCases[1].category).toBe("Non-Functional");
  });

  it("adds targeted cases for detected fields", () => {
    const { result } = generateChecklist(input({ requirement: "The user enters an email and password.", types: ["validation"], options: { ...defaultInput().options, depth: "standard" } }));
    const titles = result.testCases.map((c) => c.title);
    expect(titles).toContain("Email: rejects an address without @");
    expect(titles).toContain("Password: rejects a password below the minimum length");
  });

  it("generates per-endpoint API cases from an OpenAPI spec", () => {
    const { result, warnings } = generateChecklist(input({ apiSpec: fixture("orders-api.yaml"), types: ["status-codes", "request-validation", "api-auth", "pagination", "response-schema", "headers"] }));
    expect(warnings).toEqual([]);
    const titles = result.testCases.map((c) => c.title);
    expect(titles).toContain("POST /orders: valid request returns 201");
    expect(titles).toContain("POST /orders: returns 409 (Duplicate order reference)");
    expect(titles).toContain('POST /orders: missing required field "customerEmail" is rejected');
    expect(titles).toContain('POST /orders: invalid value for enum "channel" is rejected');
    expect(titles).toContain("GET /orders: missing token returns 401");
    expect(titles.some((t) => t.startsWith("GET /orders/{orderId}: missing token"))).toBe(false);
    expect(titles).toContain("GET /orders: pagination / sorting via page, limit");
    expect(titles).toContain("POST /orders: response matches the documented schema");
    expect(titles).toContain("the feature API: content type, CORS and caching headers");
    const missing = result.testCases.find((c) => c.title.includes('"customerEmail"'))!;
    expect(missing.api).toMatchObject({ method: "POST", endpoint: "/orders", expectedStatus: 400, body: { quantity: 2, channel: "WEB" } });
    expect(missing.api!.headers.Authorization).toBe("Bearer {{token}}");
  });

  it("reports an unreadable spec as a warning", () => {
    const { warnings } = generateChecklist(input({ apiSpec: "not: a spec", types: ["status-codes"] }));
    expect(warnings[0]).toMatch(/OpenAPI/);
  });

  it("adds Gherkin when asked", () => {
    const { result } = generateChecklist(input({ types: ["positive"], options: { ...defaultInput().options, depth: "quick", format: "both" } }));
    expect(result.testCases[0].gherkin).toMatch(/^Feature: Feature\n\n {2}Scenario: the feature: main flow/);
    expect(toGherkin({ title: "T", preconditions: "", steps: ["a", "b"], expectedResult: "ok" }, "F")).toBe("Feature: F\n\n  Scenario: T\n    Given a\n    And b\n    Then ok");
  });
});

describe("coverage", () => {
  const req = `As a shopper I want to pay.
AC1: Valid card payments succeed
AC2: Declined cards show a clear error
- Receipts are emailed after payment
Given a saved card
When I pay
Then the saved card is charged`;

  it("finds AC lines, bullets and Gherkin blocks", () => {
    expect(extractCriteria(req)).toEqual([
      { ref: "AC1", text: "Valid card payments succeed" },
      { ref: "AC2", text: "Declined cards show a clear error" },
      { ref: "AC3", text: "Receipts are emailed after payment" },
      { ref: "AC4", text: "Given a saved card When I pay Then the saved card is charged" },
    ]);
  });

  it("matches cases by ref label or wording and flags uncovered criteria", () => {
    const rows = coverageMatrix(req, [asCase({ id: "A", requirementRef: "AC1" }), asCase({ id: "B", requirementRef: "ac-2" }), asCase({ id: "C", requirementRef: "receipts emailed after payment" })]);
    expect(rows.map((r) => [r.ref, r.caseIds])).toEqual([
      ["AC1", ["A"]],
      ["AC2", ["B"]],
      ["AC3", ["C"]],
      ["AC4", []],
    ]);
  });
});

describe("exporters", () => {
  const api = asCase({ id: "TC-API-001", title: "Create order", category: "API", api: { method: "POST", endpoint: "/orders?dry=1", headers: { "Content-Type": "application/json" }, body: { q: 1 }, expectedStatus: 201, assertions: ["status 201"] } });
  const tricky = asCase({ id: "TC-1", title: '=HYPERLINK("x") and "quotes", commas', steps: ["One", "Two"] });

  it("CSV has a BOM, escapes quotes and neutralises formulas", () => {
    const csv = toCsv([tricky], "hml");
    expect(csv.startsWith("﻿ID,Title,Category")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK(""x"") and ""quotes"", commas"`);
    expect(csv).toContain('"1. One\n2. Two"');
    expect(csv).toContain(",High,");
    expect(csvCell("-1")).toBe(`"'-1"`);
    expect(csvCell("plain")).toBe("plain");
  });

  it("Markdown escapes pipes and joins steps with <br>", () => {
    const md = toMarkdownTable([asCase({ title: "a | b", steps: ["x", "y"] })], "p");
    expect(md).toContain("a \\| b");
    expect(md).toContain("1. x<br>2. y");
  });

  it("Gherkin groups scenarios by category with tags", () => {
    const f = toFeatureFile([tricky, api], "Checkout");
    expect(f).toContain("Feature: Checkout — Functional");
    expect(f).toContain("Feature: Checkout — API");
    expect(f).toContain("  @TC-1 @P0 @automation");
    expect(f.match(/^Feature:/gm)).toHaveLength(2);
  });

  it("Postman collection v2.1 has requests, baseUrl and status tests", () => {
    const p = JSON.parse(toPostman([tricky, api], "Orders"));
    expect(p.info.schema).toBe("https://schema.getpostman.com/json/collection/v2.1.0/collection.json");
    expect(p.item).toHaveLength(1);
    expect(p.item[0].request).toMatchObject({ method: "POST", url: { raw: "{{baseUrl}}/orders?dry=1", host: ["{{baseUrl}}"], path: ["orders"], query: [{ key: "dry", value: "1" }] } });
    expect(p.item[0].request.body.raw).toBe('{\n  "q": 1\n}');
    expect(p.item[0].event[0].script.exec.join("\n")).toContain("pm.response.to.have.status(201)");
    expect(p.variable[0].key).toBe("baseUrl");
  });

  it("API Playground requests use {{baseUrl}} and a status assertion", () => {
    const [r] = toPlaygroundRequests([tricky, api]);
    expect(r).toMatchObject({ method: "POST", url: "{{baseUrl}}/orders?dry=1", body: { type: "json" }, assertions: [{ type: "status", operator: "equals", expected: "201" }] });
    expect(r.headers[0]).toMatchObject({ key: "Content-Type", value: "application/json", enabled: true });
  });

  it("TC Library Markdown has summary, questions and the table", () => {
    const md = toTcLibraryMarkdown("Checkout — 5 Oct 2026", answer, [tricky], "p");
    expect(md).toContain("# Checkout — 5 Oct 2026");
    expect(md).toContain("## Open questions\n\n- Is UPI in scope?");
    expect(md).toContain("## Test cases (1)");
  });

  it("Excel has Test Cases, Summary and API sheets", async () => {
    const bytes = await toXlsx("Checkout", answer, [tricky, api], "p");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes.buffer as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Test Cases", "Summary", "API"]);
    const ws = wb.getWorksheet("Test Cases")!;
    expect(ws.getRow(1).values).toEqual([undefined, "ID", "Title", "Category", "Type", "Priority", "Preconditions", "Steps", "Test data", "Expected result", "Requirement", "Automation candidate"]);
    expect(ws.getCell("G2").value).toBe("1. One\n2. Two");
    expect(wb.getWorksheet("API")!.getCell("D2").value).toBe("/orders?dry=1");
    expect((await toXlsx("x", answer, [tricky], "p")).byteLength).toBeGreaterThan(0);
  });
});
