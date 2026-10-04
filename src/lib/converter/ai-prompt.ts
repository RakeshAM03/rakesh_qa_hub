import type { ConvertOptions, ReviewNote, Severity } from "./types";

export const MAX_AI_INPUT = 50 * 1024;

const STYLE: Record<ConvertOptions["outputStyle"], string> = {
  auto: "Match the input: test classes become Playwright Test specs (`test()` with fixtures); page objects become TypeScript page object classes.",
  test: "Output Playwright Test specs (`test()` with the `page` fixture).",
  pageObject: "Output TypeScript page object classes (a `Page` in the constructor, `Locator` fields, async methods).",
};

export const CONVERTER_SYSTEM = `You convert Selenium Java test code (TestNG/JUnit tests and page objects) into idiomatic Playwright TypeScript.
Rules:
- Use @playwright/test: import { test, expect } (and Locator/Page types for page objects).
- Use web-first assertions (await expect(locator).toBeVisible(), toHaveText, toHaveURL…) and Playwright auto-waiting. Never use fixed sleeps or waitForTimeout.
- Remove WebDriver setup/teardown; the page fixture replaces it.
- @FindBy fields become readonly Locator fields initialised in the constructor.
- Keep test names readable (method names in words) and keep tags like @smoke in titles.
- Anything you are unsure about stays in the code with a // TODO comment and gets a review note.`;

export function converterUserPrompt(java: string, opts: ConvertOptions) {
  return [
    "Options:",
    `- Input type: ${opts.inputType === "auto" ? "auto-detect" : opts.inputType === "test" ? "test class" : "page object"}`,
    `- Input framework: ${opts.framework === "auto" ? "auto-detect from imports and annotations" : opts.framework}`,
    `- Output style: ${STYLE[opts.outputStyle]}`,
    `- Locators: ${opts.locatorPreference === "semantic" ? "prefer getByRole / getByLabel / getByTestId where the original selector makes the intent clear" : "keep the original selectors"}`,
    "",
    "Selenium Java code:",
    "```java",
    java,
    "```",
  ].join("\n");
}

export const CONVERTER_SCHEMA = {
  type: "object",
  properties: {
    files: {
      type: "array",
      description: "One entry per output file, e.g. LoginTest.spec.ts and LoginPage.page.ts.",
      items: {
        type: "object",
        properties: { name: { type: "string" }, code: { type: "string" } },
        required: ["name", "code"],
        additionalProperties: false,
      },
    },
    notes: {
      type: "array",
      description: "Things a person should review.",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "warning", "attention"] },
          line: { type: ["integer", "null"], description: "1-based line in the Java input, or null." },
          message: { type: "string" },
        },
        required: ["severity", "line", "message"],
        additionalProperties: false,
      },
    },
  },
  required: ["files", "notes"],
  additionalProperties: false,
} as const;

/** "Build prompt for Claude": the same request as text, ending with a fixed JSON block for notes. */
export function converterCopyPrompt(java: string, opts: ConvertOptions) {
  return [
    CONVERTER_SYSTEM,
    "",
    converterUserPrompt(java, opts),
    "",
    "Reply with the TypeScript file(s), each in its own ```ts block preceded by its file name.",
    "Then end with the review notes as a JSON block exactly like this:",
    "```json",
    '{"notes": [{"severity": "warning", "line": 18, "message": "Thread.sleep removed — Playwright waits automatically."}]}',
    "```",
  ].join("\n");
}

const SEVERITIES = new Set<Severity>(["info", "warning", "attention"]);

/** Validates the AI's notes into ReviewNotes (drops anything malformed). */
export function cleanNotes(raw: unknown): ReviewNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((n): n is { severity: Severity; line: number | null; message: string } => !!n && typeof n === "object" && SEVERITIES.has((n as { severity: Severity }).severity) && typeof (n as { message: unknown }).message === "string")
    .slice(0, 100)
    .map((n) => ({ severity: n.severity, line: Number.isInteger(n.line) && n.line! > 0 ? n.line : null, message: n.message.slice(0, 500) }));
}
