import { type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class ConverterPage extends BasePage {
  constructor(page: Page) {
    super(page, "/selenium-to-playwright");
  }

  get javaInput() {
    return this.page.getByRole("textbox", { name: "Selenium Java code" });
  }
  get notes() {
    return this.page.getByRole("list", { name: "Review notes" }).getByRole("listitem");
  }
  get stats() {
    return this.page.getByTestId("convert-stats");
  }

  async loadSample() {
    await this.page.getByRole("button", { name: "Load sample" }).click();
  }
  async convert() {
    await this.page.getByRole("button", { name: "Convert" }).click();
  }
  async setMode(label: "Rule-based" | "Build prompt for Claude") {
    await this.page.getByLabel("Mode").click();
    await this.page.getByRole("option", { name: label }).click();
  }

  /** Copies the TypeScript output and returns it (the editor only renders visible lines). */
  async copiedOutput() {
    await this.page.getByRole("button", { name: "Copy", exact: true }).click();
    return this.page.evaluate(() => navigator.clipboard.readText());
  }
}
