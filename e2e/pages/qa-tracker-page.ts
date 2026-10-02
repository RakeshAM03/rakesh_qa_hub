import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class QaTrackerPage extends BasePage {
  constructor(page: Page) {
    super(page, "/qa-tracker");
  }

  get taskRows() {
    return this.page.getByTestId("task-row");
  }
  get historyRows() {
    return this.page.getByTestId("history-row");
  }
  get logButton() {
    return this.page.locator("form").getByRole("button", { name: "Log Entry" });
  }

  async addResource(name: string) {
    await this.page.getByRole("button", { name: "Manage resources" }).click();
    const dialog = this.page.getByRole("dialog", { name: /Manage resources/ });
    await dialog.getByLabel("Name *").fill(name);
    await dialog.getByRole("button", { name: "Add resource" }).click();
    await this.expectToast(`Added ${name}`);
    await this.page.keyboard.press("Escape");
  }

  async selectResource(name: string) {
    await this.page.getByRole("combobox", { name: /^Resource/ }).click();
    await this.page.getByRole("option", { name }).click();
  }

  async fillTask(index: number, description: string, hours: string) {
    const row = this.taskRows.nth(index);
    await row.getByLabel(/Task description/).fill(description);
    await row.getByLabel(/Time spent/).fill(hours);
  }
}
