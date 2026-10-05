import { readdirSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { generateChecklist } from "./checklist";
import { apiCases, apiEndpoints } from "./generators/api";
import { authCases } from "./generators/auth";
import { makeCtx } from "./generators/common";
import { crossCases } from "./generators/cross";
import { crudCases, roleCases, searchCases, workflowCases } from "./generators/domain";
import { fieldCases } from "./generators/fields";
import { fileCases } from "./generators/files";
import { allowedValueCases, limitCases } from "./generators/values-limits";
import { GENERIC_PHRASES, scoreCases } from "./quality";
import { extractRequirement } from "./requirement";
import { defaultInput, lines, type TcInput, type TestCase } from "./types";

const DIR = "tests/fixtures/tcgen/requirements";
const SAMPLES = readdirSync(DIR).sort();
const read = (f: string) => readFileSync(`${DIR}/${f}`, "utf8");
const input = (requirement: string, over: Partial<TcInput> = {}): TcInput => ({ ...defaultInput(), requirement, ...over });
const ctxFor = (requirement: string, over: Partial<TcInput> = {}) => {
  const i = input(requirement, over);
  return makeCtx(extractRequirement(i.requirement, i.context, i.apiSpec), i);
};

/** Every Standard Format rule a single case must meet. */
function expectStandard(c: TestCase) {
  expect(c.id, c.title).toMatch(/^TC_[A-Z0-9]+_\d{3}$/);
  expect(c.title).toMatch(/^Verify /);
  expect(c.title).not.toMatch(GENERIC_PHRASES);
  expect(c.testData.trim(), `${c.id} test data`).not.toBe("");
  expect(c.steps.length, `${c.id} steps`).toBeGreaterThanOrEqual(5);
  expect(lines(c.expectedResult).length, `${c.id} expected`).toBeGreaterThanOrEqual(3);
  const pre = lines(c.preconditions).length;
  expect(pre, `${c.id} preconditions`).toBeGreaterThanOrEqual(4);
  expect(pre).toBeLessThanOrEqual(7);
}

describe("checklist mode on the 6 sample requirements (Standard depth, Everything selected)", () => {
  it.each(SAMPLES)("%s: ≥ 25 cases in the Standard Format, every value and limit covered, quality ≥ 80", (file) => {
    const { result, requirement } = generateChecklist(input(read(file)));
    expect(result.testCases.length).toBeGreaterThanOrEqual(25);
    expect(result.testCases.length).toBeLessThanOrEqual(45);
    result.testCases.forEach(expectStandard);
    const q = scoreCases(result.testCases, requirement);
    expect(q.uncovered).toEqual([]);
    expect(q.score).toBeGreaterThanOrEqual(80);
    expect(new Set(result.testCases.map((c) => c.title.toLowerCase())).size).toBe(result.testCases.length);
    expect(result.testCases.map((c) => c.id)).toEqual(result.testCases.map((_, i) => `TC_${requirement.abbr}_${String(i + 1).padStart(3, "0")}`));
    expect(result.requirementRules.length).toBeGreaterThan(0);
    expect(result.assumptions.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toMatch(/the feature/i);
  });

  it("covers every limit at, −1 and +1 with the exact values in the test data", () => {
    const { result } = generateChecklist(input(read("1-file-upload.txt")));
    const data = result.testCases.map((c) => c.testData).join("\n");
    for (const n of ["5,242,880", "5,242,879", "5,242,881", "0 bytes"]) expect(data).toContain(n);
    const login = generateChecklist(input(read("2-login.txt"))).result.testCases.map((c) => `${c.title}\n${c.testData}`).join("\n");
    for (const n of ["7 characters", "8 characters", "9 characters", "19 characters", "20 characters", "21 characters", "Failed attempts before this test: 4", "attempt 5", "attempt 6", "14 minutes", "15 minutes", "16 minutes"]) expect(login).toContain(n);
  });

  it("is generic: the same generators produce domain-appropriate cases for unrelated requirements", () => {
    const titles = (f: string) => generateChecklist(input(read(f))).result.testCases.map((c) => c.title);
    expect(titles("1-file-upload.txt")).toEqual(expect.arrayContaining(["Verify a valid PDF resume within the size limit is uploaded successfully", "Verify a file just above 5 MB (max + 1 byte) is rejected"]));
    expect(titles("2-login.txt")).toEqual(expect.arrayContaining(["Verify the account is locked after 5 consecutive failed attempts"]));
    expect(titles("4-search-filter.txt")).toEqual(expect.arrayContaining(["Verify sorting by relevance returns the correct candidate results", "Verify pagination with 21 matching results (one more than a page)"]));
    expect(titles("5-payment.txt")).toEqual(expect.arrayContaining(["Verify the invoice can be paid by UPI", "Verify a second payment for the same invoice is blocked"]));
    expect(titles("6-api-endpoint.txt")).toEqual(expect.arrayContaining(["Verify POST /api/users with a valid token for a role without access returns 403", "Verify POST /api/users with an existing email returns 409 (duplicate)"]));
    // Upload-specific cases never appear for non-upload requirements.
    for (const f of SAMPLES.slice(1)) expect(titles(f).join("\n")).not.toMatch(/spoofed extension|file picker|malware/i);
  });

  it("respects depth targets and the selected test types", () => {
    const quick = generateChecklist(input(read("3-registration.txt"), { options: { ...defaultInput().options, depth: "quick" } })).result.testCases;
    expect(quick.length).toBeGreaterThanOrEqual(12);
    expect(quick.length).toBeLessThanOrEqual(18);
    const boundaryOnly = generateChecklist(input(read("3-registration.txt"), { types: ["boundary"] })).result.testCases;
    expect(boundaryOnly.every((c) => c.category === "Boundary Value" || c.template)).toBe(true);
  });

  it("uses context (module name, abbreviation, navigation, elements, messages, roles) when given", () => {
    const i = input(read("1-file-upload.txt"), {
      context: { ...defaultInput().context, moduleName: "Candidate Resume", navigation: "CRM > Candidates > Resume", elements: "Upload Resume, Save", messages: "File size exceeds the maximum limit of 5 MB.", roles: "Recruiter, Viewer", environment: "UAT environment" },
      options: { ...defaultInput().options, idPrefix: "CR" },
    });
    const { result } = generateChecklist(i);
    const c = result.testCases.find((x) => x.title.includes("max + 1 byte"))!;
    expect(c.id).toMatch(/^TC_CR_\d{3}$/);
    expect(c.steps[0]).toBe("Navigate to CRM > Candidates > Resume.");
    expect(c.steps.join(" ")).toContain("'Upload Resume'");
    expect(c.expectedResult).toContain("'File size exceeds the maximum limit of 5 MB.'");
    expect(c.preconditions).toContain("UAT environment");
    expect(c.preconditions).toContain("Recruiter");
    expect(result.assumptions.join(" ")).not.toMatch(/neutral placeholders/);
  });

  it("adds an assumption when navigation and element names are unknown", () => {
    const { result } = generateChecklist(input(read("5-payment.txt")));
    expect(result.assumptions.join(" ")).toMatch(/placeholders such as '<Pay an Invoice page>'/);
    expect(result.testCases[0].steps[0]).toBe("Open the '<Pay an Invoice page>'.");
  });

  it("questions reference the related test IDs", () => {
    const { result } = generateChecklist(input(read("2-login.txt")));
    expect(result.questions.some((q) => /failed-attempt counter.*\(TC_LOG_\d{3}/.test(q))).toBe(true);
  });
});

describe("individual generators", () => {
  it("allowed values: one positive per value plus disallowed classes", () => {
    const ctx = ctxFor(read("1-file-upload.txt"));
    const cases = allowedValueCases(ctx, ctx.req.lists[0]);
    expect(cases.filter((c) => c.type === "Positive" && c.category === "Functional")).toHaveLength(4);
    expect(cases.some((c) => /executable/.test(c.title) && c.category === "Security")).toBe(true);
    const pay = ctxFor(read("5-payment.txt"));
    const methods = allowedValueCases(pay, pay.req.lists[0]).map((c) => c.title);
    expect(methods).toEqual(expect.arrayContaining(["Verify an unsupported payment method ('NETBANKING') is rejected", "Verify the payment cannot be submitted without selecting a payment method"]));
  });

  it("limits: amount boundaries use exact rupee values", () => {
    const ctx = ctxFor(read("5-payment.txt"));
    const titles = limitCases(ctx, ctx.req.limits[0]).map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Verify the minimum amount ₹1 is accepted", "Verify an amount of ₹0 (min − 1) is rejected", "Verify the maximum amount ₹1,00,000 is accepted", "Verify an amount of ₹1,00,001 (max + 1) is rejected"]));
  });

  it("limits: age boundaries compute dates of birth from today", () => {
    const ctx = ctxFor(read("3-registration.txt"));
    const age = limitCases(ctx, ctx.req.limits.find((l) => l.kind === "age")!);
    const year = new Date().getFullYear();
    expect(age[0].data[0]).toContain(String(year - 18));
    expect(age[1].type).toBe("Negative");
  });

  it("fields: required, whitespace, format and duplicate checks", () => {
    const ctx = ctxFor(read("3-registration.txt"));
    const email = ctx.req.fields.find((f) => f.type === "email")!;
    const titles = fieldCases(ctx, email, "standard").map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Verify submitting with the Email left blank is blocked", "Verify an Email of only spaces is treated as blank and rejected", "Verify invalid Email formats are rejected", "Verify an Email that already exists is rejected (duplicate)"]));
  });

  it("files, auth, CRUD, search, workflow and roles each react to their triggers", () => {
    expect(fileCases(ctxFor(read("1-file-upload.txt")), "standard").length).toBeGreaterThanOrEqual(14);
    expect(authCases(ctxFor(read("2-login.txt")), "standard").map((c) => c.title)).toContain("Verify login fails for an email that is not registered, without revealing it");
    expect(crudCases(ctxFor(read("3-registration.txt")))[0].title).toBe("Verify a new user account is created when all fields are valid");
    expect(crudCases(ctxFor(read("4-search-filter.txt")))).toEqual([]);
    expect(searchCases(ctxFor(read("4-search-filter.txt"))).map((c) => c.title)).toContain("Verify combining name, location, experience returns only candidates matching all criteria");
    expect(workflowCases(ctxFor(read("5-payment.txt"))).map((c) => c.title)).toContain("Verify double-clicking confirm or two tabs cannot create a duplicate payment");
    expect(roleCases(ctxFor(read("1-file-upload.txt"))).map((c) => c.category)).toEqual(["Security", "API / Security", "Security"]);
    expect(roleCases(ctxFor(read("6-api-endpoint.txt")))).toEqual([]);
  });

  it("API: one case per documented status code, API-style steps", () => {
    const ctx = ctxFor(read("6-api-endpoint.txt"));
    const { endpoints } = apiEndpoints(ctx);
    const cases = apiCases(ctx, endpoints[0]);
    const statuses = new Set(cases.map((c) => c.api?.expectedStatus));
    for (const s of [201, 400, 401, 403, 409]) expect(statuses.has(s)).toBe(true);
    expect(cases[0].steps[0]).toBe("In the API client, create a new POST request to {{baseUrl}}/api/users.");
    expect(cases[0].base).toBe("api");
  });

  it("API: a pasted OpenAPI spec produces per-endpoint cases", () => {
    const spec = readFileSync("tests/fixtures/tcgen/orders-api.yaml", "utf8");
    const { result } = generateChecklist(input("", { apiSpec: spec, context: { ...defaultInput().context, moduleName: "Orders API" } }));
    const titles = result.testCases.map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Verify POST /orders with a valid request returns 201 and creates the order", "Verify POST /orders without the required field 'customerEmail' returns 400", "Verify POST /orders with an invalid value for 'channel' returns 400"]));
    result.testCases.forEach(expectStandard);
  });

  it("a pasted spec with no requirement text or module name still never says 'the feature'", () => {
    const { result, requirement } = generateChecklist(input("", { apiSpec: readFileSync("tests/fixtures/tcgen/orders-api.yaml", "utf8") }));
    expect(requirement.moduleName).toBe("Orders API");
    expect(requirement.entity).toBe("order");
    expect(JSON.stringify(result)).not.toMatch(/the feature/i);
    expect(result.testCases.map((c) => c.title)).toContain("Verify POST /orders with a valid request returns 201 and creates the order");
  });

    it("cross-cutting: UI version for screens, API version for endpoint-only requirements", () => {
    const ui = crossCases(ctxFor(read("4-search-filter.txt"))).map((c) => c.category);
    expect(ui).toEqual(expect.arrayContaining(["UI", "Accessibility", "Reliability", "Compatibility", "Performance"]));
    const api = crossCases(ctxFor(read("6-api-endpoint.txt"))).map((c) => c.title);
    expect(api.some((t) => /429/.test(t))).toBe(true);
    expect(api.some((t) => /keyboard/i.test(t))).toBe(false);
  });

  it("templates only appear for selected types that apply and no generator covered", () => {
    const { result } = generateChecklist(input(read("2-login.txt")));
    expect(result.testCases.some((c) => c.template)).toBe(false);
    const apiOnly = generateChecklist(input(read("6-api-endpoint.txt"))).result.testCases;
    expect(apiOnly.some((c) => /accessibility|usability|localisation/i.test(c.title) && c.template)).toBe(false);
  });
});

describe("quality scorer", () => {
  const good = generateChecklist(input(read("1-file-upload.txt"))).result.testCases;
  const req = extractRequirement(read("1-file-upload.txt"));

  it("flags weak rows with each reason", () => {
    const weak: TestCase = { ...good[0], key: "w1", title: "Check the feature works correctly", testData: "", steps: ["Open", "Click"], expectedResult: "Works as expected" };
    const dup: TestCase = { ...good[1], key: "w2", title: good[2].title };
    const q = scoreCases([weak, dup, ...good.slice(2)], req);
    expect(q.issues.get("w1")).toEqual(["test data is empty", "fewer than 5 steps", "fewer than 3 expected-result lines", 'title doesn\'t start with "Verify"', "generic wording"]);
    expect(q.issues.get("w2")).toEqual(["duplicate title"]);
    expect(q.weakKeys.size).toBe(3); // w1, w2 and the original it duplicates
  });

  it("scores 70% rows + 30% coverage and lists uncovered limits / values", () => {
    expect(scoreCases(good, req).score).toBe(100);
    const withoutPlus1 = good.filter((c) => !/max \+ 1|above/.test(c.title) && !/5,242,881|5242881/.test(c.testData + c.steps.join(" ") + c.preconditions));
    const q = scoreCases(withoutPlus1, req);
    expect(q.uncovered.some((u) => /\+1 \(5242881\)/.test(u))).toBe(true);
    expect(q.score).toBeLessThan(100);
    const noReq = scoreCases(good, null);
    expect(noReq.coverage).toBeNull();
    expect(noReq.score).toBe(100);
  });

  it("scores an empty list as 0", () => {
    expect(scoreCases([], req).score).toBe(0);
  });
});
