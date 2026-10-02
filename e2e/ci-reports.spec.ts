import { expect, test } from "@playwright/test";

import { enterPasscode, uid } from "./fixtures/helpers";
import { CiReportsPage } from "./pages/ci-reports-page";

test.describe("CI Reports @write", () => {
  test("starts with no suites", async ({ page }) => {
    const ci = new CiReportsPage(page);
    await ci.goto();
    await expect(page.getByText("No CI suites yet — add your first one")).toBeVisible();
  });

  test("validates, adds, edits, reorders and deletes suites", async ({ page }) => {
    const ci = new CiReportsPage(page);
    const first = `Regression ${uid()}`;
    const second = `Portfolio ${uid()}`;
    await ci.goto();

    await ci.openAddSuite();
    await ci.fillSuite({ name: first, repo: "not a repo", workflow: "regression.txt" });
    await page.getByRole("dialog").getByRole("button", { name: "Add suite" }).click();
    await expect(page.getByText("Use the GitHub repo as owner/name")).toBeVisible();
    await expect(page.getByText("Use the workflow file name, e.g. regression.yml")).toBeVisible();

    await ci.fillSuite({ name: first, repo: "demo-owner/demo-repo", workflow: "regression.yml", color: "Teal" });
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Add input" }).click();
    await dialog.getByLabel("Input 1 key").fill("environment");
    await dialog.getByLabel("Input 1 type").click();
    await page.getByRole("option", { name: "Choice" }).click();
    await dialog.getByLabel("Input 1 options").fill("qa, staging");
    await dialog.getByRole("button", { name: "Add suite" }).click();
    await enterPasscode(page);
    await ci.expectToast(`Added “${first}”`);

    await expect(ci.section(first)).toContainText("Connect GitHub to see runs");
    await expect(ci.section(first)).toContainText("Showing 0–0 of 0");
    await expect(ci.section(first).getByRole("button", { name: "Run Workflow" })).toBeDisabled();

    await ci.openAddSuite();
    await ci.fillSuite({ name: second, repo: "demo-owner/portfolio", workflow: "e2e.yml" });
    await page.getByRole("dialog").getByRole("button", { name: "Add suite" }).click();
    await ci.expectToast(`Added “${second}”`);

    const chips = ci.jumpBar.getByRole("button").filter({ hasNotText: "Refresh" });
    await expect(chips).toHaveText([first, second]);

    await ci.section(second).getByRole("button", { name: `More actions for ${second}` }).click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    await expect(chips).toHaveText([second, first]);
    await page.reload();
    await expect(chips).toHaveText([second, first]);

    await ci.section(first).getByRole("button", { name: `More actions for ${first}` }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    await page.getByRole("dialog").getByLabel(/Display name/).fill(`${first} v2`);
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await ci.expectToast("Suite updated");
    await expect(ci.section(`${first} v2`)).toBeVisible();

    await ci.section(second).getByRole("button", { name: `More actions for ${second}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await ci.expectToast(`Deleted “${second}”`);
    await expect(ci.section(second)).toHaveCount(0);
  });

  test("refuses suite changes without the passcode", async ({ request }) => {
    const res = await request.post("/api/ci/suites", {
      data: { name: "x", repo: "a/b", workflowFile: "a.yml", color: "blue" },
    });
    expect(res.status()).toBe(401);
  });
});
