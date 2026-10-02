import { describe, expect, it } from "vitest";

import { ALL_STEP_IDS } from "@/config/pr-qa-templates";
import { buildPrompt, type SessionInputs } from "./build-prompt";

const base: SessionInputs = {
  frontendPr: "https://github.com/org/web/pull/1",
  backendPr: "",
  additionalPrs: [],
  testEnvUrl: "",
  context: "",
  focusAreas: [],
  steps: ALL_STEP_IDS,
  specRef: "",
};

const stepLines = (prompt: string) =>
  prompt
    .split("## Steps\n")[1]
    .split("\n\n## Output")[0]
    .split("\n")
    .filter((l) => /^\d+\. /.test(l));

describe("buildPrompt", () => {
  it("includes every step, numbered 1–10, for a full session", () => {
    const lines = stepLines(buildPrompt(base));
    expect(lines).toHaveLength(10);
    expect(lines[0]).toMatch(/^1\. Analyse the PR/);
    expect(lines[9]).toMatch(/^10\. Session Closure Checklist/);
  });

  it("renumbers the selected steps in their original order", () => {
    const lines = stepLines(buildPrompt({ ...base, steps: [10, 3, 7] }));
    expect(lines).toEqual([
      expect.stringMatching(/^1\. Feature Validation/),
      expect.stringMatching(/^2\. Report/),
      expect.stringMatching(/^3\. Session Closure Checklist/),
    ]);
  });

  it("indents continuation lines under the step text, also for two-digit numbers", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("2. Test Plan — list test scenarios (positive, negative, edge, regression)\n   with priority");
    expect(prompt).toContain("10. Session Closure Checklist — confirm every step is done, list open risks,\n    and give");
  });

  it("fills inputs with fallbacks", () => {
    const prompt = buildPrompt(base);
    expect(prompt).toContain("- Frontend PR: https://github.com/org/web/pull/1");
    expect(prompt).toContain("- Backend PR: not provided");
    expect(prompt).toContain("- Additional PRs: none");
    expect(prompt).toContain("- Test environment: not provided");
    expect(prompt).toContain("- Context: none");
    expect(prompt).toContain("- Focus areas: none");
  });

  it("lists additional PRs and focus areas", () => {
    const prompt = buildPrompt({
      ...base,
      additionalPrs: ["https://github.com/org/a/pull/2", " ", "https://github.com/org/b/pull/3"],
      focusAreas: ["Security", "Regression"],
      testEnvUrl: "https://qa.example.com",
      context: "New checkout flow",
    });
    expect(prompt).toContain("- Additional PRs: https://github.com/org/a/pull/2, https://github.com/org/b/pull/3");
    expect(prompt).toContain("- Focus areas: Security, Regression — give these extra attention");
    expect(prompt).toContain("- Test environment: https://qa.example.com");
    expect(prompt).toContain("- Context: New checkout flow");
  });

  it("asks for contract comparison only when both PRs are given", () => {
    expect(buildPrompt(base)).not.toContain("compare API contracts");
    expect(buildPrompt({ ...base, backendPr: "https://github.com/org/api/pull/9" })).toContain(
      "compare API contracts",
    );
  });

  it("embeds the spec reference in step 9, keeping its indentation", () => {
    const specRef = "test('x', async () => {\n  await page.goto('/');\n});";
    const prompt = buildPrompt({ ...base, steps: [9], specRef });
    expect(prompt).toContain("1. Automation Generation");
    expect(prompt).toContain("Follow the style of this reference spec:");
    expect(prompt).toContain("   ```ts\n   test('x', async () => {\n     await page.goto('/');\n   });\n   ```");
  });

  it("leaves out the spec reference sentence when none is given", () => {
    expect(buildPrompt({ ...base, steps: [9] })).not.toContain("reference spec");
  });

  it("ends with the output instruction", () => {
    expect(buildPrompt({ ...base, steps: [] })).toMatch(
      /## Steps\n\n## Output\nWork through the steps in order/,
    );
  });
});
