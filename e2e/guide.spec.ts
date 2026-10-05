import { expect, test } from "@playwright/test";

const MODULES: [slug: string, title: string][] = [
  ["test-case-generator", "Test Case Generator"],
  ["tc-library", "TC Library"],
  ["risk-planner", "Risk-Based Test Planner"],
  ["release-readiness", "Release Readiness"],
  ["pr-qa-session", "PR QA Session"],
  ["api-playground", "API Test Playground"],
  ["bug-tracker", "Bug Tracker"],
  ["bug-formatter", "Bug Formatter"],
  ["ai-pr-review", "AI PR Review"],
  ["ci", "CI Reports"],
  ["failure-analyzer", "Test Failure Analyzer"],
  ["locator-helper", "Locator Helper"],
  ["selenium-to-playwright", "Selenium → Playwright Converter"],
  ["test-data-generator", "Test Data Generator"],
  ["qa-tracker", "QA Tracker"],
  ["automation-roi", "Automation ROI Dashboard"],
];

test.describe("User guide", () => {
  test("the index lists all 16 modules and links to the overview", async ({ page }) => {
    await page.goto("/guide");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rakesh QA Hub — User Guide");
    const table = page.locator("article table").first();
    await expect(table.getByRole("link", { name: "Open" })).toHaveCount(16);
    await page.locator("article").getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL(/\/guide\/overview$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rakesh QA Hub — Overview");
  });

  for (const [slug, title] of MODULES) {
    test(`/guide/${slug} loads with its sections and screenshot`, async ({ page }) => {
      const res = await page.goto(`/guide/${slug}`);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("article h2")).toHaveCount(11);
      const img = page.locator(`article img[src="/guide/images/${slug}.png"]`);
      await img.scrollIntoViewIfNeeded();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(1440);
      await expect(page.locator(`article a[href="/${slug}"]`).first()).toBeVisible();
    });
  }

  test("an unknown guide page is a 404", async ({ page }) => {
    const res = await page.goto("/guide/not-a-module");
    expect(res?.status()).toBe(404);
  });

  test("links between guide pages stay inside the app", async ({ page }) => {
    await page.goto("/guide/ci");
    await page.locator("article").getByRole("link", { name: "Test Failure Analyzer" }).first().click();
    await expect(page).toHaveURL(/\/guide\/failure-analyzer$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Test Failure Analyzer");
  });

  test("the sidebar Help link opens the guide", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("app-sidebar").getByRole("link", { name: "Help", exact: true }).click();
    await expect(page).toHaveURL(/\/guide$/);
  });

  test("each module page's How to use link opens its guide at the walkthrough", async ({ page }) => {
    // Sidebar names (the link's label uses them), one page per sidebar section.
    for (const [slug, name] of [["test-case-generator", "Test Case Generator"], ["bug-tracker", "Bug Tracker"], ["ci", "CI Reports"], ["automation-roi", "Automation ROI"]]) {
      await page.goto(`/${slug}`);
      await page.getByRole("link", { name: `How to use ${name} (user guide)` }).click();
      await expect(page).toHaveURL(new RegExp(`/guide/${slug}#how-to-use-it$`));
      await expect(page.locator("#how-to-use-it")).toBeVisible();
    }
  });
});
