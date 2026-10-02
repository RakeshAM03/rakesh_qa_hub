import { expect, test } from "@playwright/test";

import { enterPasscode, uid } from "./fixtures/helpers";
import { BugTrackerPage } from "./pages/bug-tracker-page";

test.describe("Bug Tracker @write", () => {
  test("starts with no teams or feature pages", async ({ page }) => {
    const bt = new BugTrackerPage(page);
    await bt.goto();
    await expect(page.getByText("No feature pages yet — click New Feature Page to add one.")).toBeVisible();
    await expect(bt.teams.getByRole("button", { name: /^All/ })).toContainText("0");
  });

  test("creates a team and a feature page, keeping counts in sync", async ({ page }) => {
    const bt = new BugTrackerPage(page);
    const team = `Team ${uid()}`;
    const feature = `Checkout : Coupon ${uid()}`;
    await bt.goto();
    await bt.createTeam(team);
    await bt.expectToast(`Team “${team}” created`);
    await expect(bt.teams.getByRole("button", { name: new RegExp(`^${team}`) })).toContainText("0");

    await page.getByRole("button", { name: "New Feature Page" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
    await expect(page.getByText("Feature name is required")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await bt.createFeature(feature, team);
    await bt.expectToast(`Feature page “${feature}” created`);
    await expect(bt.teams.getByRole("button", { name: new RegExp(`^${team}`) })).toContainText("1");
    await bt.teams.getByRole("button", { name: new RegExp(`^${team}`) }).click();
    await expect(bt.featureRows).toHaveCount(1);
    await expect(bt.featureRow(feature)).toContainText("—");

    await bt.createFeature(feature.toUpperCase());
    await expect(page.getByText(/already exists/)).toBeVisible();
  });

  test("tracks issues on a feature page and updates % valid, activity and workload", async ({ page }) => {
    const bt = new BugTrackerPage(page);
    const feature = `Search ${uid()}`;
    const assignee = `Dev ${uid()}`;
    await bt.goto();
    await bt.createFeature(feature);
    await bt.featureRow(feature).getByRole("link").click();
    await expect(page.getByRole("heading", { level: 1, name: feature })).toBeVisible();

    for (const title of ["Filter ignored", "Wrong sort order"]) {
      await page.getByRole("button", { name: /New Issue|Add the first issue/ }).first().click();
      await page.getByLabel(/^Title/).fill(title);
      await page.getByLabel("Assignee").fill(assignee);
      await page.getByRole("dialog").getByRole("button", { name: "Add issue" }).click();
      await bt.expectToast("Issue added");
    }
    await expect(page.getByTestId("issue-row")).toHaveCount(2);
    await expect(page.getByLabel("100% valid")).toBeVisible();

    await page.getByRole("switch", { name: "Wrong sort order is valid" }).click();
    await expect(page.getByLabel("50% valid")).toBeVisible();
    await page.getByLabel("Status of Filter ignored").click();
    await page.getByRole("option", { name: "Resolved" }).click();

    await page.goto("/bug-tracker");
    await expect(bt.featureRow(feature)).toContainText("50%");

    await page.goto("/bug-tracker/activity");
    const events = page.getByTestId("activity-event");
    await expect(events.filter({ hasText: "Filter ignored" }).filter({ hasText: "changed status from Open to Resolved" })).toBeVisible();
    await expect(events.filter({ hasText: "marked as invalid" }).filter({ hasText: "Wrong sort order" })).toBeVisible();

    await page.goto("/bug-tracker/workload");
    const row = page.getByTestId("workload-row").filter({ hasText: assignee });
    // Only the valid issue counts, and it's resolved: open 0, open P0/P1 0, closed 1, total 1.
    await expect(row.getByRole("cell")).toHaveText([assignee, "0", "0", "1", "1", ""]);
  });

  test("global search finds issues and features", async ({ page }) => {
    const bt = new BugTrackerPage(page);
    const feature = `Findable ${uid()}`;
    await bt.goto();
    await bt.createFeature(feature);
    await page.getByRole("combobox", { name: "Search issues and features" }).fill(feature);
    await page.locator("#bug-search-results").getByRole("link", { name: new RegExp(feature) }).click();
    await expect(page.getByRole("heading", { level: 1, name: feature })).toBeVisible();
  });

  test("deletes a feature page with the admin passcode", async ({ page }) => {
    const bt = new BugTrackerPage(page);
    const feature = `Remove ${uid()}`;
    await bt.goto();
    await bt.createFeature(feature);
    await bt.featureRow(feature).getByRole("link").click();
    await page.getByRole("button", { name: "Delete page" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete page" }).click();
    await enterPasscode(page);
    await expect(page).toHaveURL("/bug-tracker");
    await expect(bt.featureRow(feature)).toHaveCount(0);
  });
});
