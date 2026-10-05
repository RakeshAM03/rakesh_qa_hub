import { expect, test } from "@playwright/test";

import { uid } from "./fixtures/helpers";
import { PrQaSessionPage } from "./pages/pr-qa-session-page";

const FE = "https://github.com/example-org/frontend/pull/3419";
const BE = "https://github.com/example-org/backend/pull/386";

test.describe("PR QA Session", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pr-qa-session");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("Build Prompt stays disabled until a PR URL is entered; the gh diff command is shown", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await expect(s.buildButton).toBeDisabled();
    await s.frontendPr.fill(FE);
    await expect(s.buildButton).toBeEnabled();
    await expect(page.getByTestId("frontend-pr-diff")).toHaveText("gh pr diff 3419 --repo example-org/frontend");
  });

  test("rejects URLs that aren't GitHub pull requests", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill("https://example.com/not-a-pr");
    await s.buildButton.click();
    await expect(page.getByText(/Enter a GitHub pull request URL/)).toBeVisible();
    await expect(s.output).toHaveCount(0);
  });

  test("both PRs + Full Session + all focus areas: all 10 steps, both tables, both STOP gates, 4 categories, closure checklist", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    await s.backendPr.fill(BE);
    await s.template("Full Session").click();
    await s.buildButton.click();
    expect(await s.stepNumbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const text = await s.output.inputValue();
    expect(text.startsWith("# PR QA Session")).toBe(true);
    for (const part of [
      "| Changed File | Imports From | Consumed By | Existing Specs | Risk Level |",
      "| Flag Type | Location | Detail | Severity |",
      "Do not begin any browser interaction until the plan is approved",
      "**STOP — wait for the team's findings before Step 8.**",
      "Category A — Feature specs",
      "Category B — Defect specs",
      "Category C — Regression guards",
      "Category D — API contract specs",
      "## Step 10 — Session Closure Checklist",
      "`gh pr diff 3419 --repo example-org/frontend`",
      "`gh pr diff 386 --repo example-org/backend`",
      `| Test Environment | <not provided> |`,
      "Login method: <not provided> — ask before Step 3",
    ]) expect(text).toContain(part);
  });

  test("API Only keeps the original step numbers and explains what is skipped", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    await s.backendPr.fill(BE);
    await s.template("API Only").click();
    await s.step(/Automation Generation/).click();
    await s.buildButton.click();
    expect(await s.stepNumbers()).toEqual([1, 2, 3, 7, 8, 10]);
    await expect(s.output).toHaveValue(/### Contract Mismatch Analysis/);
    await expect(s.output).toHaveValue(/\| Focus Areas \| Contract Testing, Regression \|/);
    await expect(s.output).toHaveValue(/Not in this session: Step 4 UI Validation, Step 5 UX Validation, Step 6 Exploratory, Step 9 Automation Generation\./);
  });

  test("credentials never reach the draft or the prompt", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    const login = page.getByLabel("Login URL");
    await login.fill("https://qa-user:S3cret!@qa.example.com/login?token=abc123");
    await login.blur();
    await expect(page.getByText("Credentials or tokens were removed from the URL")).toBeVisible();
    await expect(login).toHaveValue("https://qa.example.com/login");
    await page.getByLabel("Login Method").click();
    await page.getByRole("option", { name: "Email + password" }).click();
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    expect(stored).not.toMatch(/S3cret|abc123|qa-user/);
    await s.buildButton.click();
    const text = await s.output.inputValue();
    expect(text).not.toMatch(/S3cret|abc123|qa-user/);
    expect(text).toContain("log in with **Email + password** at https://qa.example.com/login");
    expect(text).toContain("`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`");
  });

  test("resume from a later step adds the resume block", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    await page.getByLabel("Resume From Step").click();
    await page.getByRole("option", { name: "4. UI Validation" }).click();
    await s.buildButton.click();
    await expect(s.output).toHaveValue(/This session resumes at \*\*Step 4\*\*/);
    await expect(s.output).toHaveValue(/the approved Step 2 test plan/);
  });

  test("All / None toggle every step", async ({ page }) => {
    const pressed = page.getByRole("group", { name: /Steps/ }).locator("[aria-pressed=true]");
    await page.getByRole("button", { name: "None", exact: true }).click();
    await expect(pressed).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(pressed).toHaveCount(10);
  });

  test("Copy copies the full prompt; Reset and Download work", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    await s.backendPr.fill(BE);
    await s.buildButton.click();
    const full = await s.output.inputValue();
    await s.output.fill("edited");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(s.output).toHaveValue(full);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(full);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    expect((await download).suggestedFilename()).toBe("qa-session-prompt.md");
  });

  test("inputs are kept as a draft", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill(FE);
    await page.getByLabel("Existing Spec Folders").fill("e2e/");
    await page.reload();
    await expect(s.frontendPr).toHaveValue(FE);
    await expect(page.getByLabel("Existing Spec Folders")).toHaveValue("e2e/");
  });

  test("the How this works panel describes the 10-step flow and both STOP gates", async ({ page }) => {
    await page.getByRole("button", { name: /How this works/ }).click();
    const panel = page.locator("#how-it-works");
    await expect(panel).toContainText("STOP — you reply “Approved”");
    await expect(panel).toContainText("STOP — Claude waits for your team's findings.");
  });

  test("saves the current selection as a template @write", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    const name = `Smoke ${uid()}`;
    await s.template("Security").click();
    await page.getByRole("button", { name: "Save current" }).click();
    await page.getByLabel(/Template name/).fill(name);
    await page.getByRole("button", { name: "Save template" }).click();
    await s.expectToast(`Template “${name}” saved`);
    await page.reload();
    await expect(s.template(name)).toBeVisible();
  });
});
