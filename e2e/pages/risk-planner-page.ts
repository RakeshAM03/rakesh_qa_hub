import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

type Factor = "Complexity" | "Defect history" | "Dependencies / integrations" | "Business impact" | "Usage frequency";

export class RiskPlannerPage extends BasePage {
  constructor(page: Page) {
    super(page, "/risk-planner");
  }

  row(name: string) {
    return this.page.locator(`[data-testid="area-row"][data-area="${name}"]`);
  }
  get planRows() {
    return this.page.getByTestId("plan-row");
  }

  async createPlan(name: string, hours: number, opts: { features?: string[] } = {}) {
    await this.goto();
    await this.page.getByRole("button", { name: "New Plan" }).click();
    const dialog = this.page.getByRole("dialog", { name: "New plan" });
    await dialog.getByLabel(/^Name/).fill(name);
    await dialog.getByLabel(/Available testing hours/).fill(String(hours));
    if (opts.features) {
      await dialog.getByLabel("Import areas from Bug Tracker feature pages").check();
      await dialog.getByRole("button", { name: "Feature pages" }).click();
      for (const f of opts.features) await this.page.getByRole("checkbox", { name: f }).check();
      await this.page.keyboard.press("Escape");
    }
    await dialog.getByRole("button", { name: "Create" }).click();
    await expect(this.heading(name)).toBeVisible();
  }

  async addArea(name: string, scores: Partial<Record<Factor, number>>) {
    const before = await this.page.getByTestId("area-row").count();
    await this.page.getByRole("button", { name: "Add area" }).click();
    const row = this.page.getByTestId("area-row").nth(before);
    await row.getByLabel("Area name").fill(name);
    for (const [factor, v] of Object.entries(scores)) {
      await this.row(name).getByRole("radiogroup", { name: `${factor} for ${name}` }).getByRole("radio", { name: new RegExp(`^${v} —`) }).click();
    }
  }

  async waitSaved() {
    await expect(this.page.getByTestId("save-state")).toHaveText("Saved");
  }
}
