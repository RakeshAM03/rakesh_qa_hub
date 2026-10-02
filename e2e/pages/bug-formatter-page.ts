import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class BugFormatterPage extends BasePage {
  constructor(page: Page) {
    super(page, "/bug-formatter");
  }

  tab(name: "Paste from Claude" | "Manual" | "CSV") {
    return this.page.getByRole("tab", { name });
  }
  get findings() {
    return this.page.getByRole("region", { name: /Findings/ });
  }
  get cards() {
    return this.page.getByTestId("bug-card");
  }

  async paste(text: string) {
    await this.tab("Paste from Claude").click();
    await this.page.getByLabel("Claude Code findings").fill(text);
    await this.page.getByRole("button", { name: "Parse Findings" }).click();
  }

  async addManual(title: string, severity: "P0" | "P1" | "P2" | "P3" = "P1") {
    await this.tab("Manual").click();
    await this.page.getByLabel("Title").fill(title);
    await this.page.getByRole("radio", { name: severity }).click();
    await this.page.getByRole("button", { name: "Add Bug" }).click();
  }

  async uploadCsv(name: string, csv: string) {
    await this.tab("CSV").click();
    await this.page.getByTestId("csv-input").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(csv) });
  }

  async expectTitles(titles: string[]) {
    await expect(this.cards).toHaveCount(titles.length);
    for (const [i, t] of titles.entries()) await expect(this.cards.nth(i)).toContainText(t);
  }
}
