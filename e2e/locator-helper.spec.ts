import { expect, test } from "@playwright/test";

import { LocatorHelperPage } from "./pages/locator-helper-page";

test.describe("Locator Helper", () => {
  test("shows an empty state before any HTML is parsed", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await expect(lh.heading("Locator Helper")).toBeVisible();
    await expect(page.getByText("Paste HTML and click Parse")).toBeVisible();
  });

  test("sample → submit button → test attribute is the top, robust suggestion", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await lh.loadSample();
    await lh.treeNode(/^button data-testid="login-btn"/).click();

    const top = lh.suggestions.first();
    await expect(top).toHaveAttribute("data-strategy", "testAttr");
    const badge = await top.getByText(/\d+ · Robust/).textContent();
    expect(Number(badge?.split(" ")[0])).toBeGreaterThanOrEqual(80);
    await expect(top.getByTestId("locator-code")).toHaveText("page.getByTestId('login-btn')");
    await expect(page.getByText("Best choice: Test attribute")).toBeVisible();

    await top.getByRole("tab", { name: "Selenium Java" }).click();
    await top.getByRole("button", { name: "Copy" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`By.cssSelector("[data-testid='login-btn']")`);

    // No API key in tests: the AI button is replaced by a copyable prompt.
    await expect(page.getByRole("button", { name: "Ask AI for alternatives" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy prompt for Claude" })).toBeVisible();
  });

  test("auto-generated ids are flagged and a data-testid tip is shown", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await lh.loadSample();
    await lh.treeNode(/^button #ember1042/).click();
    await expect(lh.suggestions.first()).not.toHaveAttribute("data-strategy", "id");
    await expect(page.locator('article[data-strategy="id"]')).toContainText("Looks auto-generated");
    await expect(page.getByText(/Ask developers to add `data-testid`/)).toBeVisible();
  });

  test("page object snippet, find by text and interactive filter", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await lh.loadSample();
    await page.getByLabel("Find by text").fill("Forgot password?");
    await page.getByRole("button", { name: "Find", exact: true }).click();
    await expect(lh.treeNode(/^a "Forgot password\?"/)).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Page Object snippet" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("private WebElement forgotPasswordLink;");
    await expect(dialog).toContainText("readonly forgotPasswordLink = this.page.getByRole('link', { name: 'Forgot password?' });");
    await page.keyboard.press("Escape");

    await page.getByLabel("Interactive only").click();
    await expect(lh.treeNode(/^h2/)).toHaveCount(0);
    await expect(lh.treeNode(/^input #email/)).toBeVisible();
  });

  test("locator tester counts matches and reports syntax errors", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await lh.loadSample();
    await lh.testLocator("form#login button");
    await expect(page.getByRole("status")).toContainText("2 elements match (CSS)");
    await lh.testLocator("//input[@type='password']");
    await expect(page.getByRole("status")).toContainText("1 element matches (XPath)");
    await lh.testLocator("button[");
    await expect(page.getByRole("alert").filter({ hasText: "Invalid CSS selector" })).toBeVisible();
  });

  test("pasted HTML is never rendered or executed, and work survives a reload", async ({ page }) => {
    const lh = new LocatorHelperPage(page);
    await lh.goto();
    await lh.pasteAndParse(
      `<div id="box"><img src="/x.png" onerror="window.__pwned = 1"><script>window.__pwned = 2</script><button>Go</button></div>`,
    );
    await lh.treeNode(/^button "Go"/).click();
    await expect(lh.suggestions.first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await expect(page.locator("main img, main #box")).toHaveCount(0);

    await page.reload();
    await expect(lh.treeNode(/^button "Go"/)).toHaveAttribute("aria-pressed", "true");
  });
});
