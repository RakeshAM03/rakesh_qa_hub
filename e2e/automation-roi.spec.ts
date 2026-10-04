import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { AutomationRoiPage } from "./pages/automation-roi-page";

test.describe("Automation ROI Dashboard", () => {
  test("loads with the period selector and formulas", async ({ page }) => {
    const roi = new AutomationRoiPage(page);
    await roi.goto();
    await expect(roi.heading("Automation ROI Dashboard")).toBeVisible();
    await expect(page.getByLabel("Period")).toContainText("Last 90 days");
    await page.getByRole("button", { name: "How is this calculated?" }).click();
    await expect(page.getByText("= runs × automated tests × manual minutes ÷ 60")).toBeVisible();
  });
});

test.describe("Automation ROI Dashboard @write", () => {
  test("add a project → KPIs and charts → validation → snapshot → CSV and summary → edit/delete need the passcode", async ({ page }) => {
    const roi = new AutomationRoiPage(page);
    const name = `Checkout regression ${uid()}`;
    await roi.goto();
    await expect(roi.heading("Automation ROI Dashboard")).toBeVisible();

    const manage = page.getByRole("dialog", { name: "Manage projects" });
    await page.getByRole("button", { name: "Manage projects" }).click();
    await manage.getByRole("button", { name: "Add project" }).click();

    // automated ≤ total is enforced
    const dialog = page.getByRole("dialog", { name: "Add project" });
    await dialog.getByLabel(/^Name/).fill(name);
    await dialog.getByLabel(/^Total test cases/).fill("10");
    await dialog.getByLabel(/^Automated test cases/).fill("20");
    await dialog.getByLabel(/^Avg manual time per test/).fill("6");
    await dialog.getByLabel(/^Build cost/).fill("120");
    await dialog.getByRole("button", { name: "Add project" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Automated test cases can't exceed the total.");

    await roi.addProject({ name, total: 240, automated: 180, manual: 6, seconds: 20, runs: 40, build: 120, maintenance: 8, hourly: 1500 });
    await expectToast(page, "Project added");
    await expect(manage).toContainText(name);
    await manage.getByRole("button", { name: "Close" }).click();
    await expect(manage).toBeHidden();

    // Last 90 days with estimates: ≈ 2.96 months → net ≈ 2,000+ h, coverage 75%
    await expect(roi.row(name)).toContainText("75%");
    await expect(roi.kpi("Automation coverage")).not.toHaveText("—");
    await expect(roi.kpi("Hours saved")).toHaveText(/^[\d,]+ h$/);
    await expect(roi.kpi("ROI")).toHaveText(/^[\d,]+%$/);
    await expect(roi.kpi("CI pass rate")).toHaveText("—");
    await expect(roi.kpi("Cost saved")).toHaveText(/^₹[\d,]+$/);
    await expect(page.getByRole("region", { name: "Cumulative hours saved vs build cost" }).locator(".recharts-line")).toBeVisible();
    await expect(page.getByRole("region", { name: "Hours saved by project" }).locator(".recharts-bar-rectangle").first()).toBeVisible();
    await expect(page.getByRole("region", { name: "CI pass rate trend (weekly)" })).toContainText("Link a CI suite");
    await expect(roi.row(name)).toContainText(/Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Jan|Feb/); // break-even month

    // Log a snapshot (updates counts and coverage)
    await page.getByRole("button", { name: `Log a snapshot for ${name}` }).click();
    await page.getByLabel("Automated", { exact: true }).fill("200");
    await page.getByRole("button", { name: "Log snapshot" }).click();
    await expectToast(page, "Snapshot logged");
    await expect(roi.row(name)).toContainText("83.3%");

    // Export CSV and copy a status summary
    const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "CSV" }).click()]);
    expect(csv.suggestedFilename()).toMatch(/^automation-roi-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
    await page.getByRole("button", { name: "Copy summary" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Automation saved [\d,]+ hours in the last 90 days across \d+ projects?/);

    // Detail drawer
    await roi.row(name).click();
    const drawer = page.getByRole("dialog", { name });
    await expect(drawer).toContainText("Manual effort avoided");
    await expect(drawer).toContainText("using estimates");
    await page.keyboard.press("Escape");

    // Edit needs the passcode
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("dialog", { name: "Edit project" }).getByLabel(/^Build cost/).fill("100");
    await page.getByRole("dialog", { name: "Edit project" }).getByRole("button", { name: "Save" }).click();
    await enterPasscode(page);
    await expectToast(page, "Project updated");

    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expectToast(page, "Project deleted");
    await expect(roi.row(name)).toHaveCount(0);
  });
});
