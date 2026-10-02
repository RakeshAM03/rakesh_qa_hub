import { expect, test } from "@playwright/test";

import { uid } from "./fixtures/helpers";
import { QaTrackerPage } from "./pages/qa-tracker-page";

test.describe("QA Tracker @write", () => {
  test("asks for a resource first on a fresh install", async ({ page }) => {
    const qa = new QaTrackerPage(page);
    await qa.goto();
    await expect(page.getByText("Add a resource to start logging.")).toBeVisible();
    await expect(page.getByText("No time data recorded yet.")).toBeVisible();
  });

  test("validates the entry, logs several tasks and shows them in history and analytics", async ({ page }) => {
    const qa = new QaTrackerPage(page);
    const person = `Demo Resource ${uid()}`;
    await qa.goto();
    await qa.addResource(person);

    await qa.logButton.click();
    await expect(page.getByText("Required").first()).toBeVisible();
    await expect(page.getByText("Must be more than 0")).toBeVisible();

    await qa.selectResource(person);
    await qa.fillTask(0, "Checkout : Coupon : Regression", "1.5");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(qa.taskRows).toHaveCount(2);
    await qa.fillTask(1, "Bug verification", "0.3");
    await qa.logButton.click();
    await expect(page.getByText("Use steps of 0.25")).toBeVisible();
    await qa.fillTask(1, "Bug verification", "0.75");
    await qa.logButton.click();
    await qa.expectToast(`Logged 2 tasks for ${person}`);
    await expect(qa.taskRows).toHaveCount(1);

    await expect(page.getByRole("tab", { name: person })).toHaveAttribute("data-state", "active");
    await expect(qa.historyRows).toHaveCount(2);
    await expect(qa.historyRows.first()).toContainText("Checkout : Coupon : Regression");
    await expect(page.locator("dl > div").filter({ hasText: "Total hours" })).toContainText("2.25 h");

    await page.getByLabel("Search tasks").fill("verification");
    await expect(qa.historyRows).toHaveCount(1);
  });

  test("edits a task's status inline", async ({ page }) => {
    const qa = new QaTrackerPage(page);
    const person = `Demo Resource ${uid()}`;
    await qa.goto();
    await qa.addResource(person);
    await qa.selectResource(person);
    await qa.fillTask(0, "Exploratory testing", "2");
    await qa.logButton.click();
    await qa.expectToast(/Logged 1 task/);
    await page.getByLabel("Status for Exploratory testing").click();
    await page.getByRole("option", { name: "Completed" }).click();
    await qa.expectToast("Task updated");
    await expect(page.getByLabel("Status for Exploratory testing")).toContainText("Completed");
  });

  test("deactivated resources disappear from the form and tabs", async ({ page }) => {
    const qa = new QaTrackerPage(page);
    const person = `Inactive ${uid()}`;
    await qa.goto();
    await qa.addResource(person);
    await expect(page.getByRole("tab", { name: person })).toBeVisible();
    await page.getByRole("button", { name: "Manage resources" }).click();
    await page.getByRole("switch", { name: `${person} active` }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: person })).toHaveCount(0);
  });
});
