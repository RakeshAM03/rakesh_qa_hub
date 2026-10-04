import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class AutomationRoiPage extends BasePage {
  constructor(page: Page) {
    super(page, "/automation-roi");
  }

  kpi(label: string) {
    return this.page.getByTestId(`kpi-${label.toLowerCase().replace(/\s+/g, "-")}`);
  }
  row(name: string) {
    return this.page.getByTestId("roi-row").filter({ hasText: name });
  }

  async addProject(v: { name: string; total: number; automated: number; manual: number; seconds: number; runs: number; build: number; maintenance?: number; hourly?: number }) {
    const dialog = this.page.getByRole("dialog", { name: "Add project" });
    await dialog.getByLabel(/^Name/).fill(v.name);
    await dialog.getByLabel(/^Total test cases/).fill(String(v.total));
    await dialog.getByLabel(/^Automated test cases/).fill(String(v.automated));
    await dialog.getByLabel(/^Avg manual time per test/).fill(String(v.manual));
    await dialog.getByLabel(/^Avg automated time per test/).fill(String(v.seconds));
    await dialog.getByLabel(/^Runs per month/).fill(String(v.runs));
    await dialog.getByLabel(/^Build cost/).fill(String(v.build));
    if (v.maintenance !== undefined) await dialog.getByLabel(/^Maintenance/).fill(String(v.maintenance));
    if (v.hourly !== undefined) await dialog.getByLabel(/^Hourly cost/).fill(String(v.hourly));
    await dialog.getByRole("button", { name: "Add project" }).click();
    await expect(dialog).toBeHidden();
  }
}
