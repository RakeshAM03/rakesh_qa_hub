/** Exports for generated test cases: CSV, Markdown, Gherkin, Postman, TC Library and API Playground. */

import { toGherkin } from "./checklist";
import { CATEGORIES, priorityLabel, type GenerationResult, type PriorityScheme, type TestCase } from "./types";

export const COLUMNS = ["ID", "Title", "Category", "Type", "Priority", "Preconditions", "Steps", "Test data", "Expected result", "Requirement", "Automation candidate"] as const;

export const numberedSteps = (steps: string[]) => steps.map((s, i) => `${i + 1}. ${s}`).join("\n");

/** Row values in COLUMNS order. */
export function rowValues(c: TestCase, scheme: PriorityScheme): string[] {
  return [c.id, c.title, c.category, c.type, priorityLabel(c.priority, scheme), c.preconditions, numberedSteps(c.steps), c.testData, c.expectedResult, c.requirementRef, c.automationCandidate ? "Yes" : "No"];
}

/** Quotes when needed; prefixes formula-like values (= + - @) with ' so spreadsheets don't run them. */
export function csvCell(v: string): string {
  const s = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(s) || s !== v ? `"${s.replace(/"/g, '""')}"` : s;
}

/** UTF-8 CSV with BOM so Excel opens it cleanly. */
export function toCsv(cases: TestCase[], scheme: PriorityScheme): string {
  const lines = [COLUMNS.join(","), ...cases.map((c) => rowValues(c, scheme).map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

const mdCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim() || " ";

export function toMarkdownTable(cases: TestCase[], scheme: PriorityScheme): string {
  const cols = ["ID", "Title", "Category", "Type", "Priority", "Preconditions", "Steps", "Test data", "Expected result"];
  const lines = [`| ${cols.join(" | ")} |`, `|${cols.map(() => "---").join("|")}|`];
  for (const c of cases) {
    lines.push(`| ${[c.id, c.title, c.category, c.type, priorityLabel(c.priority, scheme), c.preconditions, numberedSteps(c.steps), c.testData, c.expectedResult].map(mdCell).join(" | ")} |`);
  }
  return lines.join("\n") + "\n";
}

/** Scenario lines only (an AI scenario's own Feature line is dropped). */
function scenarioOf(c: TestCase, feature: string): string {
  const src = c.gherkin?.trim() ? c.gherkin : toGherkin(c, feature);
  const lines = src.split(/\r?\n/).filter((l) => !/^\s*Feature:/i.test(l));
  while (lines.length && !lines[0].trim()) lines.shift();
  const body = lines.map((l) => (/^\s*(Scenario|Scenario Outline|Background|Examples):/i.test(l) ? `  ${l.trim()}` : /^\s*\|/.test(l) ? `      ${l.trim()}` : l.trim() ? `    ${l.trim()}` : ""));
  const tags = [`@${c.id}`, `@${c.priority}`, ...(c.automationCandidate ? ["@automation"] : [])].join(" ");
  return [`  ${tags}`, ...body].join("\n");
}

/** One Feature per category. */
export function toFeatureFile(cases: TestCase[], moduleName: string): string {
  const name = moduleName.trim() || "Feature";
  return (
    CATEGORIES.filter((cat) => cases.some((c) => c.category === cat))
      .map((cat) => [`Feature: ${name} — ${cat}`, "", ...cases.filter((c) => c.category === cat).map((c) => `${scenarioOf(c, name)}\n`)].join("\n"))
      .join("\n") + "\n"
  );
}

const apiCases = (cases: TestCase[]) => cases.filter((c) => c.api && c.api.endpoint);

/** {{baseUrl}} + relative endpoint; absolute URLs stay as they are. */
export function requestUrl(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint) || endpoint.startsWith("{{")) return endpoint;
  return `{{baseUrl}}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
}

const bodyText = (b: unknown) => (b === null || b === undefined || b === "" ? "" : typeof b === "string" ? b : JSON.stringify(b, null, 2));

/** Postman collection v2.1 with a status test per request. */
export function toPostman(cases: TestCase[], name: string): string {
  const items = apiCases(cases).map((c) => {
    const a = c.api!;
    const raw = requestUrl(a.endpoint);
    const [pathPart, query = ""] = raw.replace(/^\{\{baseUrl\}\}/, "").split("?");
    const absolute = /^https?:\/\//i.test(raw);
    const body = bodyText(a.body);
    return {
      name: `${c.id} ${c.title}`,
      request: {
        method: a.method.toUpperCase(),
        header: Object.entries(a.headers).map(([key, value]) => ({ key, value })),
        url: absolute
          ? { raw }
          : {
              raw,
              host: ["{{baseUrl}}"],
              path: pathPart.split("/").filter(Boolean),
              ...(query ? { query: query.split("&").map((q) => ({ key: decodeURIComponent(q.split("=")[0]), value: decodeURIComponent(q.split("=").slice(1).join("=")) })) } : {}),
            },
        ...(body ? { body: { mode: "raw", raw: body, options: { raw: { language: "json" } } } } : {}),
        description: [c.expectedResult, ...a.assertions.map((x) => `- ${x}`)].filter(Boolean).join("\n"),
      },
      event: a.expectedStatus
        ? [{ listen: "test", script: { type: "text/javascript", exec: [`pm.test("Status is ${a.expectedStatus}", function () {`, `  pm.response.to.have.status(${a.expectedStatus});`, "});"] } }]
        : [],
    };
  });
  return JSON.stringify(
    {
      info: { name: name || "Generated API tests", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json" },
      item: items,
      variable: [{ key: "baseUrl", value: "https://api.example.com" }],
    },
    null,
    2,
  );
}

/** Markdown saved as the TC Library entry's output. */
export function toTcLibraryMarkdown(title: string, r: Pick<GenerationResult, "summary" | "assumptions" | "questions">, cases: TestCase[], scheme: PriorityScheme): string {
  const parts = [`# ${title}`, ""];
  if (r.summary.trim()) parts.push("## Summary", "", r.summary.trim(), "");
  if (r.assumptions.length) parts.push("## Assumptions", "", ...r.assumptions.map((a) => `- ${a}`), "");
  if (r.questions.length) parts.push("## Open questions", "", ...r.questions.map((q) => `- ${q}`), "");
  parts.push(`## Test cases (${cases.length})`, "", toMarkdownTable(cases, scheme));
  return parts.join("\n");
}

/** API Playground request bodies for POST /api/api-playground/collections (requests[]). */
export function toPlaygroundRequests(cases: TestCase[]) {
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
  return apiCases(cases).map((c, i) => {
    const a = c.api!;
    const body = bodyText(a.body);
    return {
      name: `${c.id} ${c.title}`.slice(0, 200),
      method: (METHODS.includes(a.method.toUpperCase()) ? a.method.toUpperCase() : "GET") as "GET",
      url: requestUrl(a.endpoint),
      params: [],
      headers: Object.entries(a.headers).map(([key, value], j) => ({ id: `h${i}-${j}`, key, value, enabled: true })),
      auth: { type: "none" as const },
      body: body ? { type: "json" as const, text: body } : { type: "none" as const },
      assertions: a.expectedStatus ? [{ id: `a${i}`, type: "status" as const, target: "", operator: "equals" as const, expected: String(a.expectedStatus) }] : [],
    };
  });
}

export const hasApiCases = (cases: TestCase[]) => apiCases(cases).length > 0;
