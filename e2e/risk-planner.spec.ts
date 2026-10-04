import { expect, test } from "@playwright/test";

import { enterPasscode, uid } from "./fixtures/helpers";
import { RiskPlannerPage } from "./pages/risk-planner-page";

test.describe("Risk-Based Test Planner", () => {
  test("shows the empty state", async ({ page }) => {
    const rp = new RiskPlannerPage(page);
    await rp.goto();
    await expect(rp.heading("Risk-Based Test Planner")).toBeVisible();
  });
});

test.describe("Risk-Based Test Planner @write", () => {
  test("three areas → ordered plan and matrix → override hours → defer → Markdown → PR QA Session", async ({ page }) => {
    const rp = new RiskPlannerPage(page);
    const name = `Sprint ${uid()}`;
    await rp.createPlan(name, 20);

    await rp.addArea("Checkout payment", { Complexity: 5, "Defect history": 5, "Dependencies / integrations": 5, "Business impact": 5, "Usage frequency": 5 });
    await rp.addArea("Search", { "Business impact": 3 });
    await rp.addArea("Profile settings", { Complexity: 1, "Defect history": 1, "Dependencies / integrations": 1, "Business impact": 1, "Usage frequency": 1 });
    await rp.waitSaved();

    await expect(rp.row("Checkout payment")).toContainText("Critical");
    await expect(rp.row("Profile settings")).toContainText("Low");
    await expect(rp.planRows.nth(0)).toContainText("Checkout payment");
    await expect(rp.planRows.nth(1)).toContainText("Search");
    await expect(rp.planRows.nth(2)).toContainText("Profile settings");
    await expect(page.getByTestId("capacity")).toHaveText("20 h allocated of 20 h");

    // Matrix placement (impact × likelihood)
    await expect(page.locator('[data-cell="5-4"]')).toContainText("Checkout payment");
    await expect(page.locator('[data-cell="1-2"]')).toContainText("Profile settings");

    // Override hours: the rest is redistributed
    await rp.row("Search").getByLabel("Hours override for Search").fill("10");
    await rp.waitSaved();
    await expect(rp.planRows.filter({ hasText: "Search" })).toContainText("10 h");
    await expect(page.getByTestId("capacity")).toHaveText("20 h allocated of 20 h");

    // Defer with a mandatory reason
    await rp.planRows.filter({ hasText: "Profile settings" }).getByRole("switch", { name: "Defer Profile settings" }).click();
    const dialog = page.getByRole("dialog", { name: /Defer/ });
    await dialog.getByRole("button", { name: "Defer" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "A reason is required" })).toBeVisible();
    await dialog.getByLabel("Reason").fill("No changes this sprint");
    await dialog.getByRole("button", { name: "Defer" }).click();
    await expect(page.getByRole("list", { name: "Accepted risks" })).toContainText("Profile settings");
    await expect(page.getByRole("list", { name: "Accepted risks" })).toContainText("No changes this sprint");
    await expect(rp.planRows).toHaveCount(2);
    await rp.waitSaved();

    // Copy as Markdown
    await page.getByRole("button", { name: "Copy Markdown" }).click();
    const md = await page.evaluate(() => navigator.clipboard.readText());
    expect(md).toContain(`### Test plan — ${name}`);
    expect(md).toMatch(/\| 1 \| Checkout payment \| Critical \|/);
    expect(md).toContain("- Profile settings (Low, score 1.6) — No changes this sprint");

    // Reload keeps everything (auto-saved)
    await page.reload();
    await expect(rp.planRows.nth(0)).toContainText("Checkout payment");
    await expect(page.getByRole("list", { name: "Accepted risks" })).toContainText("Profile settings");

    // Send to PR QA Session pre-fills context and focus areas
    await rp.planRows.filter({ hasText: "Checkout payment" }).getByRole("button", { name: "Send to PR QA Session" }).click();
    await expect(page).toHaveURL("/pr-qa-session");
    await expect(page.getByLabel(/Additional context/i)).toHaveValue(/Risk level: Critical .*Focus: negative and edge cases for Checkout payment/);
    await expect(page.getByRole("button", { name: "Contract Testing" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Regression", exact: true })).toHaveAttribute("aria-pressed", "true");

    // Clean up
    await rp.goto();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await enterPasscode(page);
    await expect(page.getByRole("link", { name })).toHaveCount(0);
  });

  test("imports areas from Bug Tracker and suggests defect history", async ({ page, request }) => {
    const rp = new RiskPlannerPage(page);
    const feature = `Orders ${uid()}`;
    const f = await (await request.post("/api/bug-tracker/features", { data: { name: feature } })).json();
    for (const severity of ["P0", "P1", "P2", "P2"]) {
      await request.post(`/api/bug-tracker/features/${f.feature.id}/issues`, { data: { title: `Bug ${severity} ${uid()}`, severity } });
    }
    await rp.createPlan(`Plan ${uid()}`, 8, { features: [feature] });
    await expect(rp.row(feature)).toBeVisible();
    // 4 valid issues, 2 P0/P1 counted twice → weighted 6 → suggest 3 (current default is 3 → no hint); set 1 to see it
    await rp.row(feature).getByRole("radiogroup", { name: `Defect history for ${feature}` }).getByRole("radio", { name: /^1 —/ }).click();
    const hint = rp.row(feature).getByRole("button", { name: `Apply suggested Defect history 3 for ${feature}` });
    await expect(hint).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /Apply all suggestions/ }).click();
    await expect(rp.row(feature).getByRole("radiogroup", { name: `Defect history for ${feature}` }).getByRole("radio", { name: /^3 —/ })).toHaveAttribute("aria-checked", "true");
    await expect(hint).toHaveCount(0);
  });
});
