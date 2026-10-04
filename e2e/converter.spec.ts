import { expect, test } from "@playwright/test";

import { ConverterPage } from "./pages/converter-page";

test.describe("Selenium → Playwright Converter", () => {
  test("converts the sample with rules: Playwright code, review notes, stats", async ({ page }) => {
    const c = new ConverterPage(page);
    await c.goto();
    await expect(c.heading("Selenium → Playwright Converter")).toBeVisible();
    await c.loadSample();
    await c.convert();

    const ts = await c.copiedOutput();
    expect(ts).toContain("await page.goto(");
    expect(ts).toContain("test(");
    expect(ts).toContain("expect(");
    expect(ts).not.toContain("Thread.sleep");
    expect(ts).toContain("export class LoginPage");

    await expect(c.notes.filter({ hasText: "Thread.sleep(2000)" })).toBeVisible();
    await expect(c.notes.filter({ hasText: "Driver setup/teardown removed" })).toBeVisible();
    await expect(c.stats).toContainText(/\d+ lines converted · \d+ needs? review · \d+ removed \(.*sleeps.*\)/);

    // Clicking a note with a line highlights it in the Java editor.
    await c.notes.filter({ hasText: "Thread.sleep(2000)" }).getByRole("button").click();
    await expect(page.locator(".cm-review-line").first()).toContainText("Thread.sleep(2000)");
  });

  test("downloads a zip when the input has a test and a page object, a .ts file otherwise", async ({ page }) => {
    const c = new ConverterPage(page);
    await c.goto();
    await c.loadSample();
    await c.convert();
    const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download .zip" }).click()]);
    expect(zip.suggestedFilename()).toBe("playwright-conversion.zip");

    await page.getByRole("button", { name: "Clear" }).click();
    await c.javaInput.fill(`driver.get("https://example.com");\nThread.sleep(1000);`);
    await c.convert();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download converted.spec.ts" }).click()]);
    expect(file.suggestedFilename()).toBe("converted.spec.ts");
  });

  test("without an API key, AI mode is hidden and 'Build prompt for Claude' gives a copyable prompt", async ({ page }) => {
    const c = new ConverterPage(page);
    await c.goto();
    await page.getByLabel("Mode").click();
    await expect(page.getByRole("option", { name: "AI", exact: true })).toHaveCount(0);
    await page.getByRole("option", { name: "Build prompt for Claude" }).click();
    await c.loadSample();
    await c.convert();
    await page.getByRole("button", { name: "Copy prompt" }).click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("Selenium Java code:");
    expect(prompt).toContain("public class LoginTest");
    expect(prompt).toContain('{"notes": [');
  });

  test("keeps the last conversions in History", async ({ page }) => {
    const c = new ConverterPage(page);
    await c.goto();
    await c.loadSample();
    await c.convert();
    await page.reload();
    await page.getByRole("button", { name: "History" }).click();
    await page.getByRole("menuitem", { name: /LoginPage/ }).click();
    await expect(c.stats).toBeVisible();
    expect(await c.copiedOutput()).toContain("export class LoginPage");
  });
});
