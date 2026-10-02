import { expect, test } from "@playwright/test";

import { BugFormatterPage } from "./pages/bug-formatter-page";

const FINDINGS = `Summary of the session:

1. **P2 — Table overflows on small screen**
   Steps: Open orders, resize to 375px
   Expected: Table scrolls
   Actual: Page scrolls sideways

2. **P0 — Checkout fails with saved card**
   Steps: Add item, pay with saved card
   Actual: 500 error`;

test.describe("Bug Formatter", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/bug-formatter");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("starts empty", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await expect(bf.findings).toContainText("No bugs logged yet");
    await expect(page.getByRole("button", { name: "Parse Findings" })).toBeDisabled();
  });

  test("parses Claude findings and sorts by severity", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.paste(FINDINGS);
    await bf.expectToast("2 findings added");
    await bf.expectTitles(["Checkout fails with saved card", "Table overflows on small screen"]);
    await bf.cards.nth(1).getByRole("button", { name: /^P2 Table overflows/ }).click();
    await expect(bf.cards.nth(1)).toContainText("Resize to 375px");
  });

  test("warns when nothing can be parsed", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.paste("Everything passed, no issues.");
    await bf.expectToast(/No findings found/);
    await expect(bf.cards).toHaveCount(0);
  });

  test("manual form validates the title and keeps severity for the next bug", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.tab("Manual").click();
    await page.getByRole("button", { name: "Add Bug" }).click();
    await expect(page.getByText("Required", { exact: true })).toBeVisible();
    await bf.addManual("Search ignores filters", "P3");
    await bf.expectToast("Added");
    await expect(page.getByLabel("Title")).toHaveValue("");
    await expect(page.getByRole("radio", { name: "P3" })).toHaveAttribute("aria-checked", "true");
  });

  test("imports a CSV, skipping rows without a title", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.uploadCsv("bugs.csv", "title,SEVERITY,steps\nCSV bug one,p1,Do A > Do B\n,P0,no title\nCSV bug two,urgent,");
    await bf.expectToast(/2 bugs added from bugs.csv. 1 row without a Title skipped/);
    await bf.expectTitles(["CSV bug one", "CSV bug two"]);
  });

  test("downloads the CSV template", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.tab("CSV").click();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Template" }).click();
    expect((await download).suggestedFilename()).toBe("bug-template.csv");
  });

  test("findings survive a reload, copy as Markdown and clear with confirmation", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.paste(FINDINGS);
    await page.reload();
    await expect(bf.cards).toHaveCount(2);

    await page.getByRole("button", { name: "Copy for Jira" }).click();
    await bf.expectToast("Copied for Jira");
    const jira = await page.evaluate(() => navigator.clipboard.readText());
    expect(jira).toContain("h2. \\[P0\\] Checkout fails with saved card");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .md" }).click();
    expect((await download).suggestedFilename()).toBe("bug-report.md");

    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Clear all" }).click();
    await expect(bf.findings).toContainText("No bugs logged yet");
  });

  test("edits a bug from the Manual tab", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.addManual("Typo in footer", "P3");
    await page.getByRole("button", { name: "Edit Typo in footer" }).click();
    await page.getByLabel("Title").fill("Typo in page footer");
    await page.getByRole("button", { name: "Save changes" }).click();
    await bf.expectTitles(["Typo in page footer"]);
  });

  test("escapes pasted HTML", async ({ page }) => {
    const bf = new BugFormatterPage(page);
    await bf.paste("1. P1 — <img src=x onerror=alert(1)> broken");
    await expect(bf.cards.first()).toContainText("<img src=x onerror=alert(1)> broken");
    await expect(page.locator("img[src=x]")).toHaveCount(0);
  });
});
