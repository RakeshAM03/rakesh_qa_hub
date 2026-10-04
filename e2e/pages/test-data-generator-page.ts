import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class TestDataGeneratorPage extends BasePage {
  constructor(page: Page) {
    super(page, "/test-data-generator");
  }

  async goto() {
    await super.goto();
    // Start from an empty draft each time.
    await this.page.evaluate(() => localStorage.removeItem("qa-hub:test-data-generator:draft"));
    await this.page.reload();
  }

  preset(name: string) {
    return this.page.getByRole("region", { name: "Presets" }).getByRole("button", { name, exact: true });
  }

  get fieldRows() {
    return this.page.getByTestId("field-row");
  }

  get rows() {
    return this.page.getByLabel("Rows", { exact: true });
  }

  mode(name: "Valid only" | "Mixed" | "Edge cases only") {
    return this.page.getByRole("radio", { name: new RegExp(`^${name}`) });
  }

  async setFormat(label: string) {
    await this.page.getByLabel("Output format").click();
    await this.page.getByRole("option", { name: label, exact: true }).click();
  }

  get previewTable() {
    return this.page.getByRole("table", { name: "Generated data preview" });
  }

  get stats() {
    return this.page.getByTestId("stats");
  }

  async generate() {
    await this.page.getByRole("button", { name: "Generate", exact: true }).click();
    await expect(this.stats).toBeVisible();
  }

  /** Clicks a download button and returns the file name and text. */
  async download(button: string | RegExp) {
    const [dl] = await Promise.all([this.page.waitForEvent("download"), this.page.getByRole("button", { name: button }).click()]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), text: path ? await readFile(path, "utf8") : "" };
  }
}
