import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { ReleaseReadinessPage } from "./pages/release-readiness-page";

test.describe("Release Readiness", () => {
  test("shows the empty state and the built-in template", async ({ page }) => {
    const rr = new ReleaseReadinessPage(page);
    await rr.goto();
    await expect(rr.heading("Release Readiness")).toBeVisible();
    await page.getByRole("link", { name: "Manage templates" }).click();
    await expect(page.getByRole("list", { name: "Templates" })).toContainText("Standard release");
    await expect(page.getByRole("list", { name: "Templates" })).toContainText("4 sections · 13 gates (5 auto)");
  });
});

test.describe("Release Readiness @write", () => {
  test("create from template → tick gates → score changes → sign-off → Go → summary → change needs passcode", async ({ page }) => {
    const rr = new ReleaseReadinessPage(page);
    const name = `Checkout revamp ${uid()}`;
    await rr.createRelease(name, { version: "v2.4.0" });

    // 13 gates from the Standard template; auto gates without linked data can't check.
    await expect(page.getByTestId("gate-row")).toHaveCount(13);
    await expect(rr.gate("No open P0 bugs")).toContainText("Can't check — link Bug Tracker feature pages");
    await expect(rr.scoreRing).toHaveAccessibleName(/Readiness 0%/);

    await rr.setGate("Smoke test passed", "Pass");
    await expect(rr.breakdown).toContainText("1 passed");
    const after1 = await rr.scoreRing.getAttribute("aria-label");
    expect(after1).toMatch(/Readiness [1-9]\d?%/);

    for (const g of [
      "Regression suite passed",
      "New features tested against acceptance criteria",
      "Cross-browser / responsive checks done",
      "Customer issue regression pack passed",
      "No open P0 bugs",
      "No open P1 bugs",
      "Known issues documented",
      "No unresolved P0 review flags",
      "Release notes reviewed",
      "Staging matches production config",
      "Rollback plan documented",
    ]) {
      await rr.setGate(g, "Pass");
    }
    await rr.setGate("Monitoring/alerts in place", "N/A");
    await expect(rr.scoreRing).toHaveAccessibleName("Readiness 100% — Ready to go");
    await expect(rr.verdict).toHaveText("Ready to go");

    // A failed blocker makes it "Not ready".
    await rr.setGate("No open P0 bugs", "Fail");
    await expect(rr.verdict).toHaveText("Not ready");
    await expect(page.getByRole("alert").filter({ hasText: "Blockers" })).toContainText("No open P0 bugs");
    await rr.setGate("No open P0 bugs", "Pass");

    // Sign-off
    const qa = page.getByRole("list", { name: "Sign-offs" }).getByRole("listitem").filter({ hasText: "QA" }).first();
    await qa.getByRole("button", { name: "Sign" }).click();
    await page.getByLabel("Your name", { exact: true }).fill("Sam Tester");
    await page.getByRole("button", { name: "Save sign-off" }).click();
    await expect(qa).toContainText("Approved by Sam Tester");

    // Decision
    await page.getByRole("region", { name: "Readiness score" }).getByRole("button", { name: "Record decision" }).click();
    await page.getByRole("radio", { name: "Go", exact: true }).click();
    await page.getByLabel(/^Comment/).fill("All gates green.");
    await page.getByRole("button", { name: "Record decision" }).last().click();
    await expectToast(page, "Decision recorded");
    await expect(page.getByTestId("decision-card")).toContainText("Go");
    await expect(page.getByTestId("decision-card")).toContainText("Snapshot at decision: 100%");
    await expect(rr.heading(name).locator("..").locator("..")).toBeVisible();

    // Copy summary
    await page.getByRole("button", { name: "Copy summary" }).click();
    await page.getByRole("menuitem", { name: "Markdown" }).click();
    const summary = await page.evaluate(() => navigator.clipboard.readText());
    expect(summary).toContain(`### Release v2.4.0 — ${name}`);
    expect(summary).toContain("Decision: **GO** (score 100%)");
    expect(summary).toContain("Sign-offs: QA ✅, Dev lead ⏳, Product ⏳");

    // Later edits don't change the snapshot
    await rr.setGate("Smoke test passed", "Fail");
    await expect(page.getByTestId("decision-card")).toContainText("Snapshot at decision: 100%");

    // Changing the decision needs the passcode and is logged
    await page.getByRole("button", { name: "Change decision" }).click();
    await page.getByRole("radio", { name: "No-Go" }).click();
    await page.getByLabel(/^Comment/).fill("Smoke failed after the fix.");
    await page.getByRole("button", { name: "Record decision" }).last().click();
    await enterPasscode(page);
    await expectToast(page, "Decision recorded");
    await expect(page.getByRole("list", { name: "Activity" })).toContainText("changed decision from Go to No-Go");

    // Listed with status and readiness
    await rr.goto();
    const row = page.getByRole("table", { name: "Releases" }).getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("No-Go");
    await expect(row).toContainText("11 / 12 passed");
  });

  test("auto gate reads Bug Tracker: an open P0 in a linked feature fails the blocker; override needs a note", async ({ page, request }) => {
    const rr = new ReleaseReadinessPage(page);
    const feature = `Payments ${uid()}`;
    const f = await (await request.post("/api/bug-tracker/features", { data: { name: feature } })).json();
    await request.post(`/api/bug-tracker/features/${f.feature.id}/issues`, { data: { title: "Card declined for valid cards", severity: "P0" } });

    await rr.createRelease(`Payments release ${uid()}`, { features: [feature] });
    await expect(rr.gate("No open P0 bugs")).toContainText("No open P0 bugs: 1 open P0 issue");
    await expect(rr.gate("No open P0 bugs").getByRole("radio", { name: "Fail" })).toHaveAttribute("aria-checked", "true");
    await expect(rr.verdict).toHaveText("Not ready");

    await rr.gate("No open P0 bugs").getByRole("radio", { name: "Pass" }).click();
    const dialog = page.getByRole("dialog", { name: /Override/ });
    await dialog.getByLabel("Note").fill("Fix verified on staging; issue closes after deploy.");
    await dialog.getByRole("button", { name: "Override" }).click();
    await expect(rr.gate("No open P0 bugs")).toContainText("Overridden by");
    await expect(rr.gate("No open P0 bugs").getByRole("radio", { name: "Pass" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Delete release", exact: true }).click();
    await enterPasscode(page);
    await expect(page).toHaveURL("/release-readiness");
  });
});
