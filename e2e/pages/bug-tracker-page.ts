import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class BugTrackerPage extends BasePage {
  constructor(page: Page) {
    super(page, "/bug-tracker");
  }

  get featureRows() {
    return this.page.getByTestId("feature-row");
  }
  featureRow(name: string) {
    return this.featureRows.filter({ hasText: name });
  }
  get teams() {
    return this.page.getByRole("navigation", { name: "Teams" });
  }

  async createTeam(name: string) {
    await this.teams.getByRole("button", { name: "New Team" }).click();
    await this.page.getByLabel(/Team name/).fill(name);
    await this.page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  }

  async createFeature(name: string, team?: string) {
    await this.page.getByRole("button", { name: "New Feature Page" }).first().click();
    await this.page.getByLabel(/Feature Name/).fill(name);
    if (team) {
      await this.page.getByRole("dialog").getByRole("combobox", { name: "Team" }).click();
      await this.page.getByRole("option", { name: team }).click();
    }
    await this.page.getByRole("dialog").getByRole("button", { name: "Create" }).click();
  }
}
