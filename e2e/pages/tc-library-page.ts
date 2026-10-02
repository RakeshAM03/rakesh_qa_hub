import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class TcLibraryPage extends BasePage {
  constructor(page: Page) {
    super(page, "/tc-library");
  }

  get entries() {
    return this.page.getByTestId("tc-entry");
  }
  entry(name: string) {
    return this.entries.filter({ hasText: name });
  }

  async create(name: string, output: string, prReference = "") {
    await this.page.getByRole("button", { name: "New Entry" }).first().click();
    await this.page.getByRole("textbox", { name: /^Name/ }).fill(name);
    if (prReference) await this.page.getByLabel(/PR Reference/).fill(prReference);
    await this.page.getByLabel(/Step 1 \+ Step 2 Output/).fill(output);
    await this.page.getByRole("button", { name: "Save to Library" }).click();
  }

  async search(q: string) {
    await this.page.getByLabel("Search the library").fill(q);
  }

  async importJson(json: unknown) {
    await this.page.getByRole("button", { name: "Import JSON" }).click();
    await this.page
      .getByTestId("tc-import-input")
      .setInputFiles({ name: "import.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
  }
}
