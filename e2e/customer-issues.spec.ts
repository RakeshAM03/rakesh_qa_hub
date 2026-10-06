import { expect, test, type Page } from "@playwright/test";

import { enterPasscode } from "./fixtures/helpers";

/**
 * Customer Issue RCA, end to end, against the local mock Jira (e2e/mock-jira.mjs) — never a real
 * Jira. Data is fake (DEMO-2xx, "Demo Product A").
 */
const MOCK = "http://127.0.0.1:3999";
const PASS = { "x-admin-passcode": process.env.E2E_ADMIN_PASSCODE ?? "e2e-passcode" };

async function pick(page: Page, label: string | RegExp, option: string | RegExp) {
  await page.getByLabel(label, { exact: typeof label === "string" }).click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" }).click();
}

test.describe("Customer Issue RCA @write", () => {
  test("Jira sync → Needs RCA → classify → generate cases → run blocks the release gate → pass → complete → dashboard", async ({ page, request }) => {
    test.setTimeout(120_000);
    await request.post(`${MOCK}/__mock/reset`);
    // Generic setup: a product, the JQL and a product mapping (Settings → Jira).
    const product = await (await request.post("/api/customer-issues/lists", { data: { list: "PRODUCT", name: "Demo Product A" } })).json();
    expect(product.item.id).toBeTruthy();
    const saved = await request.patch("/api/customer-issues/jira", { headers: PASS, data: { jql: "project = DEMO AND labels = customer-reported", productMapping: [{ kind: "component", value: "Checkout", productId: product.item.id }] } });
    expect(saved.ok()).toBe(true);

    // 1. Sync now (the mock answers one 429 first; the client waits Retry-After and continues).
    await page.goto("/customer-issues");
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText(/Jira sync: 2 added · 0 updated · 0 unchanged/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /^Needs RCA \(\d+\)$/ }).click();
    const row = page.getByTestId("issue-row").filter({ hasText: "DEMO-201" });
    await expect(row).toContainText("Not classified");
    await expect(row).toContainText("Jira");
    await row.getByRole("link", { name: "DEMO-201" }).click();

    // 2. Classify (dependent sub-category, defaults pre-filled) and complete the RCA.
    await expect(page.getByRole("heading", { level: 1, name: "DEMO-201" })).toBeVisible();
    await expect(page.getByText("Synced from Jira")).toBeVisible();
    await expect(page.getByLabel("Product")).toContainText("Demo Product A");
    await pick(page, "Disposition", "Valid Bug");
    await pick(page, /^RCA category/, "Code Defect");
    await expect(page.getByLabel(/^Catchable by QA\?/)).toContainText("Yes");
    await expect(page.getByLabel("Owner team")).toContainText("Dev");
    await page.getByLabel(/^Sub-category/).click();
    await expect(page.getByRole("option", { name: "Static asset/cache issue" })).toHaveCount(0);
    await page.getByRole("option", { name: "Logic error" }).click();
    await pick(page, /^Should have been caught at/, "QA functional testing");
    await pick(page, /^Why it escaped/, "Missing test case");
    await pick(page, /^Detected by/, "Customer");
    await pick(page, /^Severity/, "P2 - High");
    await page.getByLabel(/^RCA — root cause and fix/).fill("Removing a coupon didn't recalculate the total.");
    await page.getByLabel(/^Prevention action/).fill("Regression cases for coupon removal; recalculation unit test.");
    await expect(page.getByRole("button", { name: "Mark RCA complete" })).toBeDisabled(); // unsaved changes
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Mark RCA complete" }).click();
    await expect(page.getByText("RCA marked complete")).toBeVisible();

    // 3. Generate checklist regression cases.
    await page.getByRole("button", { name: /Generate test cases/ }).click();
    await page.getByRole("menuitem", { name: /Checklist/ }).click();
    await page.getByRole("button", { name: /^Add \d+ cases$/ }).click();
    await expect(page.getByTestId("regression-case").first()).toContainText("TC_CI_DEMO-201_01");
    const caseCount = await page.getByTestId("regression-case").count();
    expect(caseCount).toBeGreaterThanOrEqual(5);

    // 4. A release with the Standard template (it includes the regression-pack gate) + a linked run.
    const rel = await (await request.post("/api/release-readiness/releases", { data: { name: "Demo checkout release", version: "v3.2.0", templateId: "builtin_standard_release", actor: "Demo Reviewer" } })).json();
    const releaseId = (rel.release ?? rel).id;
    await page.goto("/customer-issues/runs");
    await page.getByRole("button", { name: "New release run" }).click();
    await page.getByLabel("Name *").fill("v3.2.0 regression");
    await pick(page, "Release Readiness release (optional)", /Demo checkout release/);
    await page.getByRole("button", { name: "Create run" }).click();
    await expect(page.getByTestId("run-status")).toHaveText("In progress");
    await expect(page.getByTestId("run-case")).toHaveCount(caseCount);

    // 5. Fail one case → run Blocked → gate fails.
    await page.getByRole("group", { name: "Result for TC_CI_DEMO-201_01" }).getByRole("button", { name: "Fail" }).click();
    await expect(page.getByTestId("run-status")).toHaveText("Blocked");
    await expect(page.getByRole("button", { name: "Send to Bug Formatter" })).toBeVisible();
    await page.goto(`/release-readiness/${releaseId}`);
    const gate = page.getByTestId("gate-row").filter({ hasText: "Customer issue regression pack passed" });
    await expect(gate).toContainText(`1/${caseCount} executed, 1 failed`);
    await expect(gate.getByRole("link", { name: "Open run" })).toBeVisible();
    await gate.getByRole("link", { name: "Open run" }).click();

    // 6. Pass every case → run Complete → gate passes.
    const groups = page.getByRole("group", { name: /^Result for / });
    for (let i = 0; i < caseCount; i++) {
      await groups.nth(i).getByRole("button", { name: "Pass" }).click();
      await expect(groups.nth(i).getByRole("button", { name: "Pass" })).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByTestId("run-status")).toHaveText("Complete");
    await page.goto(`/release-readiness/${releaseId}`);
    await expect(page.getByTestId("gate-row").filter({ hasText: "Customer issue regression pack passed" })).toContainText(`${caseCount}/${caseCount} executed, 0 failed`);

    // 7. Dashboard reflects it.
    await page.goto("/customer-issues");
    const kpis = page.getByRole("list", { name: "Key figures" });
    await expect(kpis).toContainText("% found by customers first");
    await expect(kpis.getByRole("listitem").filter({ hasText: "Needs RCA" })).toContainText("1"); // DEMO-202 still unclassified
    await expect(page.getByRole("figure").filter({ hasText: "RCA categories" })).toContainText("Code Defect");
    const issueRow = page.getByTestId("issue-row").filter({ hasText: "DEMO-201" });
    await expect(issueRow).toContainText("RCA complete");
    await expect(issueRow).toContainText("Pass");

    // A second sync leaves the hub's classification alone.
    await page.getByRole("button", { name: "Sync now" }).click();
    await expect(page.getByText(/Jira sync: 0 added · 0 updated · 2 unchanged/)).toBeVisible({ timeout: 20_000 });
    await expect(issueRow).toContainText("RCA complete");
  });

  test("CSV import maps columns and old Type values, and skips existing keys", async ({ page }) => {
    await page.goto("/customer-issues");
    await page.getByRole("button", { name: "Import" }).click();
    const csv = ["Issue key,Summary,Status,Created date,Catchable?,Type,RCA,Comments", "DEMO-501,Sample: export is empty,Resolved,01/09/2026,Yes,Code,Empty list not handled.,", "DEMO-502,Sample: banner flickers,Open,02/09/2026,No,Deploy,,", "DEMO-501,Sample: duplicate row,Open,03/09/2026,,,,"].join("\n");
    await page.getByTestId("ci-import-file").setInputFiles({ name: "issues.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByLabel("Map column Type")).toContainText("RCA category (or old Type)");
    await expect(page.getByLabel("Category for Code")).toContainText("Code Defect");
    await expect(page.getByLabel("Category for Deploy")).toContainText("Infra / Deployment");
    await expect(page.getByTestId("ci-import-summary")).toContainText("3 ready to import");
    await page.getByRole("button", { name: /^Import 3 issues$/ }).click();
    await expect(page.getByText(/2 issues imported · 1 skipped \(already exist\): DEMO-501/)).toBeVisible();
    await expect(page.getByTestId("issue-row").filter({ hasText: "DEMO-502" })).toContainText("Infra / Deployment");
  });

  test("Settings → Lists adds a product; editing needs the passcode", async ({ page }) => {
    await page.goto("/customer-issues/settings");
    await page.getByLabel("New product name").fill("Demo Product Z");
    await page.getByRole("button", { name: "Add product" }).click();
    await expect(page.getByRole("list", { name: "Products" })).toContainText("Demo Product Z");
    await page.getByRole("button", { name: "Edit Demo Product Z" }).click();
    await page.getByLabel("Name").first().fill("Demo Product Y");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await enterPasscode(page);
    await expect(page.getByRole("list", { name: "Products" })).toContainText("Demo Product Y");
  });
});
