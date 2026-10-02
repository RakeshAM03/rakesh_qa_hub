import { expect, test } from "@playwright/test";

import { enterPasscode, uid } from "./fixtures/helpers";
import { AiPrReviewPage } from "./pages/ai-pr-review-page";

test.describe("AI PR Review", () => {
  test("generates a review prompt from PR URLs", async ({ page }) => {
    const r = new AiPrReviewPage(page);
    await r.goto();
    const generate = page.getByRole("button", { name: "Generate", exact: true });
    await expect(generate).toBeDisabled();
    await r.prUrls.fill("https://github.com/org/web/pull/12, not-a-url");
    await expect(page.getByText(/Not a GitHub pull request URL: not-a-url/)).toBeVisible();
    await expect(generate).toBeDisabled();
    await r.prUrls.fill("https://github.com/org/web/pull/12\nhttps://github.com/org/api/pull/7");
    await generate.click();
    await expect(r.generatedPrompt).toHaveValue(/- https:\/\/github.com\/org\/web\/pull\/12\n- https:\/\/github.com\/org\/api\/pull\/7/);
    await expect(r.generatedPrompt).toHaveValue(/\| Repo \| Flag Type \| Location \| Detail \| Severity \| Suggested Fix \|/);
  });

  test("shows an error when no flag table is found", async ({ page }) => {
    const r = new AiPrReviewPage(page);
    await r.goto();
    await r.claudeOutput.fill("Looks good to me, no issues.");
    await expect(page.getByText(/^No flag table found/)).toBeVisible();
  });

  test("parses Claude's table, fixes a row and saves the flags @write", async ({ page }) => {
    const r = new AiPrReviewPage(page);
    const repo = `org/web-${uid()}`;
    await r.goto();
    await r.claudeOutput.fill(`Review done.

| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |
|---|---|---|---|---|---|
| ${repo} | Logic Error | \`#12 > src/cart.ts:40\` | Discount applied twice | P0 | Apply once |
| ${repo} | Perf | #12 > src/list.ts:9 | Slow render | P1 | Memoise |`);
    await expect(page.getByText("2 flags found")).toBeVisible();
    await expect(page.getByText(/1 need fixing/)).toBeVisible();
    const save = page.getByRole("button", { name: /^Save 2 flags/ });
    await expect(save).toBeDisabled();

    await page.getByLabel("Flag type for row 2").click();
    await page.getByRole("option", { name: "Regression Risk" }).click();
    await expect(save).toBeEnabled();
    await save.click();
    await r.expectToast("Saved 2 flags");

    await page.getByLabel("Search flags").fill(repo);
    await expect(r.flagRows).toHaveCount(2);
    const link = r.flagRows.filter({ hasText: "Discount applied twice" }).getByRole("link");
    await expect(link).toHaveAttribute("href", new RegExp(`^https://github.com/${repo}/pull/12/files#diff-[0-9a-f]{64}R40$`));
  });

  test("adds a flag manually and filters by severity and type @write", async ({ page }) => {
    const r = new AiPrReviewPage(page);
    const repo = `org/manual-${uid()}`;
    await r.goto();
    await page.getByRole("radio", { name: "Enter manually" }).click();
    await page.getByRole("button", { name: "Add flag" }).click();
    await expect(page.getByText("Repo is required")).toBeVisible();
    await page.getByRole("textbox", { name: /^Repo/ }).fill(repo);
    await page.getByRole("combobox", { name: /^Flag Type/ }).click();
    await page.getByRole("option", { name: "Security" }).click();
    await page.getByRole("textbox", { name: "Location" }).fill("#5 > api/auth.ts:10");
    await page.getByRole("textbox", { name: /^Detail/ }).fill("Token is logged on failure");
    await page.getByRole("radio", { name: "P0" }).click();
    await page.getByRole("button", { name: "Add flag" }).click();
    await r.expectToast("Flag added");

    await page.getByLabel("Search flags").fill(repo);
    await expect(r.flagRows).toHaveCount(1);
    await r.severityFilter("P1").click();
    await expect(page.getByText("No flags match these filters.")).toBeVisible();
    await r.severityFilter("All").click();
    await r.typeFilter(/^Security —/).click();
    await expect(r.flagRows).toHaveCount(1);
  });

  test("deletes a flag with the admin passcode @write", async ({ page }) => {
    const r = new AiPrReviewPage(page);
    const repo = `org/del-${uid()}`;
    await r.goto();
    await r.claudeOutput.fill(`| Repo | Flag Type | Location | Detail | Severity | Suggested Fix |\n|---|---|---|---|---|---|\n| ${repo} | Security | #1 > a.ts:1 | Delete me | P1 | Fix |`);
    await page.getByRole("button", { name: /^Save 1 flag/ }).click();
    await page.getByLabel("Search flags").fill(repo);
    await r.flagRows.first().getByRole("button", { name: "Delete flag" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await enterPasscode(page);
    await r.expectToast("Flag deleted");
    await expect(page.getByText("No flags match these filters.")).toBeVisible();
  });
});
