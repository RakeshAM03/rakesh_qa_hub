import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { FailureAnalyzerPage } from "./pages/failure-analyzer-page";

const fixture = (name: string) => readFileSync(join(process.cwd(), "tests/fixtures/failure-analyzer", name), "utf8");

test.describe("Test Failure Analyzer", () => {
  test("groups a mixed Selenium log by root cause", async ({ page }) => {
    const fa = new FailureAnalyzerPage(page);
    await fa.goto();
    await expect(fa.heading("Test Failure Analyzer")).toBeVisible();
    await expect(page.getByText("Paste failures or upload a report")).toBeVisible();
    await fa.pasteSampleAndAnalyze();

    await expect(page.getByTestId("fa-total")).toHaveText("6");
    await expect(fa.verdict).toHaveText("50% of failures look like automation issues; 2 clusters look like product bugs; 1 is an environment problem.");
    await expect(fa.section("Locator / element not found (2)")).toBeVisible();
    await expect(fa.section("Timing / synchronisation (1)")).toBeVisible();
    await expect(fa.section("Assertion / product behaviour (1)")).toBeVisible();
    await expect(fa.section("API / backend error (1)")).toBeVisible();
    await expect(fa.section("Environment / infrastructure (1)")).toBeVisible();
    // two locator failures from the same page method form one cluster
    await expect(fa.section(/^Locator/).getByTestId("fa-cluster")).toHaveCount(1);
    await expect(fa.section(/^Locator/)).toContainText("2 tests");

    // details drawer highlights app frames
    await fa.section(/^Locator/).getByRole("button", { name: "View details" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByTestId("fa-stack")).toContainText("com.example.pages.ProfilePage.setName");
    await page.keyboard.press("Escape");

    // no key → copy AI prompt instead of Explain
    await expect(page.getByRole("button", { name: "Explain with AI" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy AI prompt" }).first()).toBeVisible();
  });

  test("sends a product bug to Bug Formatter pre-filled", async ({ page }) => {
    const fa = new FailureAnalyzerPage(page);
    await fa.goto();
    await fa.pasteSampleAndAnalyze();
    await fa.section(/^Assertion/).getByRole("button", { name: "Send to Bug Formatter" }).click();
    await expect(page).toHaveURL("/bug-formatter");
    await expect(page.getByRole("tab", { name: "Manual" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Pre-filled from Test Failure Analyzer")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("expected [3] but found [2]");
    await expect(page.getByLabel("Actual result")).toHaveValue("java.lang.AssertionError: expected [3] but found [2]");
    await expect(page.getByLabel("Steps to reproduce")).toHaveValue(/Run the automated test: ProfileTest\.showsOrderHistory/);
    // the hand-off is one-shot
    await page.reload();
    await expect(page.getByText("Pre-filled from Test Failure Analyzer")).toHaveCount(0);
  });

  test("parses uploaded TestNG, JUnit and Playwright reports together", async ({ page }) => {
    const fa = new FailureAnalyzerPage(page);
    await fa.goto();
    await fa.upload([
      { name: "testng-results.xml", content: fixture("testng-results.xml") },
      { name: "TEST-LoginTest.xml", content: fixture("TEST-com.example.tests.LoginTest.xml") },
      { name: "results.json", content: fixture("results.json") },
    ]);
    await expect(page.getByRole("list", { name: "Selected files" }).getByRole("listitem")).toHaveCount(3);
    await fa.analyze();
    await expect(page.getByTestId("fa-total")).toHaveText("6");
    await expect(page.getByText("4 passed · 3 skipped")).toBeVisible();
  });

  test("From CI explains that GitHub isn't connected", async ({ page }) => {
    const fa = new FailureAnalyzerPage(page);
    await fa.goto();
    await page.getByRole("tab", { name: "From CI" }).click();
    await expect(page.getByText(/Connect GitHub in CI Reports to use this/)).toBeVisible();
  });
});

test.describe("Test Failure Analyzer @write", () => {
  test("saves an analysis, marks a known issue, reopens and deletes with the passcode", async ({ page }) => {
    const fa = new FailureAnalyzerPage(page);
    const name = `E2E analysis ${uid()}`;
    await fa.goto();
    await fa.pasteSampleAndAnalyze();

    await fa.section(/^Timing/).getByRole("button", { name: "Mark as known flaky" }).click();
    await page.getByLabel("Label").fill("Spinner overlay flake");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Marked as a known issue");
    await expect(fa.section(/^Timing/)).toContainText("Known: Spinner overlay flake");
    await page.getByLabel(/Hide known issues/).click();
    await expect(fa.section(/^Timing/)).toHaveCount(0);

    await page.getByRole("button", { name: "Save analysis" }).click();
    await page.getByLabel("Name (optional)").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Analysis saved");

    await page.getByRole("tab", { name: /History/ }).click();
    const item = page.getByRole("list", { name: "Saved analyses" }).getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("6 failures");
    await item.getByRole("button", { name: "Open" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByTestId("fa-total")).toHaveText("6");

    await page.getByRole("tab", { name: /History/ }).click();
    await item.getByRole("button", { name: `Delete ${name}` }).click();
    await enterPasscode(page);
    await expectToast(page, "Analysis deleted");
    await expect(item).toHaveCount(0);

    await page.getByRole("tab", { name: /Known issues/ }).click();
    await page.getByRole("button", { name: "Delete Spinner overlay flake" }).click();
    await expectToast(page, "Known issue removed");
  });
});
