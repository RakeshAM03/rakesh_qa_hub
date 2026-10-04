import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class ReleaseReadinessPage extends BasePage {
  constructor(page: Page) {
    super(page, "/release-readiness");
  }

  get verdict() {
    return this.page.getByTestId("rr-verdict");
  }
  get breakdown() {
    return this.page.getByTestId("rr-breakdown");
  }
  get scoreRing() {
    return this.page.getByRole("region", { name: "Readiness score" }).getByRole("img");
  }
  gate(title: string) {
    return this.page.locator(`[data-testid="gate-row"][data-gate="${title}"]`);
  }

  async createRelease(name: string, opts: { version?: string; features?: string[] } = {}) {
    await this.goto();
    await this.page.getByRole("button", { name: "New Release" }).first().click();
    const dialog = this.page.getByRole("dialog", { name: "New release" });
    await dialog.getByLabel("Name").fill(name);
    if (opts.version) await dialog.getByLabel("Version").fill(opts.version);
    await expect(dialog.getByLabel("Template")).toContainText("Standard release");
    if (opts.features?.length) {
      await dialog.getByRole("button", { name: "Feature pages" }).click();
      for (const f of opts.features) await this.page.getByRole("checkbox", { name: f }).check();
      await this.page.keyboard.press("Escape");
    }
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(this.page).toHaveURL(/\/release-readiness\/[^/]+$/);
    await expect(this.heading(name)).toBeVisible();
  }

  async setGate(title: string, status: "Pending" | "Pass" | "Fail" | "N/A") {
    await this.gate(title).getByRole("radio", { name: status }).click();
    await expect(this.gate(title).getByRole("radio", { name: status })).toHaveAttribute("aria-checked", "true");
  }
}
