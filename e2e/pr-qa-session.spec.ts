import { expect, test } from "@playwright/test";

import { uid } from "./fixtures/helpers";
import { PrQaSessionPage } from "./pages/pr-qa-session-page";

test.describe("PR QA Session", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pr-qa-session");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("Build Prompt stays disabled until a PR URL is entered", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await expect(s.buildButton).toBeDisabled();
    await s.frontendPr.fill("https://github.com/org/web/pull/42");
    await expect(s.buildButton).toBeEnabled();
  });

  test("rejects URLs that aren't GitHub pull requests", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill("https://example.com/not-a-pr");
    await s.buildButton.click();
    await expect(page.getByText(/Enter a GitHub pull request URL/)).toBeVisible();
    await expect(s.output).toHaveCount(0);
  });

  test("builds a prompt with deselected steps renumbered", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill("https://github.com/org/web/pull/42");
    await s.backendPr.fill("https://github.com/org/api/pull/7");
    await s.template("API Only").click();
    await s.step(/Automation Generation/).click();
    await s.buildButton.click();
    const lines = await s.stepLines();
    expect(lines.map((l) => l.split(" — ")[0])).toEqual([
      "1. Analyse the PR",
      "2. Test Plan",
      "3. Feature Validation",
      "4. Report",
      "5. Defect Consolidation",
      "6. Session Closure Checklist",
    ]);
    await expect(s.output).toHaveValue(/compare API contracts/);
    await expect(s.output).toHaveValue(/Focus areas: Contract Testing, Regression/);
  });

  test("All / None toggle every step", async ({ page }) => {
    const pressed = page.getByRole("group", { name: /Steps/ }).locator("[aria-pressed=true]");
    await page.getByRole("button", { name: "None", exact: true }).click();
    await expect(pressed).toHaveCount(0);
    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(pressed).toHaveCount(10);
  });

  test("Copy, Reset and Download work on the output", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill("https://github.com/org/web/pull/42");
    await s.buildButton.click();
    await s.output.fill("edited");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(s.output).toHaveValue(/You are a senior QA engineer/);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("## Steps");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    expect((await download).suggestedFilename()).toBe("qa-session-prompt.md");
  });

  test("inputs are kept as a draft", async ({ page }) => {
    const s = new PrQaSessionPage(page);
    await s.frontendPr.fill("https://github.com/org/web/pull/42");
    await page.reload();
    await expect(s.frontendPr).toHaveValue("https://github.com/org/web/pull/42");
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
