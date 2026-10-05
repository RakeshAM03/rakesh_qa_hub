import { readFile } from "node:fs/promises";

import { expect, type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class TestCaseGeneratorPage extends BasePage {
  constructor(page: Page) {
    super(page, "/test-case-generator");
  }

  async goto() {
    await super.goto();
    await this.page.evaluate(() => localStorage.removeItem("qa-hub:test-case-generator:draft"));
    await this.page.reload();
    await expect(this.heading("Test Case Generator")).toBeVisible();
  }

  get requirement() {
    return this.page.getByLabel("Requirement", { exact: true });
  }

  get rows() {
    return this.page.getByTestId("case-row");
  }

  /** Titles are editable inputs, so read their values. */
  async titles() {
    return this.page.locator('[aria-label^="Title of "]').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  }

  async moreContext(moduleName: string) {
    await this.page.getByRole("button", { name: "More context" }).click();
    await this.page.getByLabel("Module / feature name").fill(moduleName);
  }

  async checklist() {
    await this.page.getByRole("button", { name: "Generate checklist (no AI)" }).click();
  }

  async importAnswer(text: string) {
    await this.page.getByRole("button", { name: "Copy prompt for Claude" }).click();
    await this.page.getByLabel("Paste Claude's answer").fill(text);
    await this.page.getByRole("button", { name: "Import", exact: true }).click();
  }

  async download(button: string | RegExp) {
    const [dl] = await Promise.all([this.page.waitForEvent("download"), this.page.getByRole("button", { name: button }).click()]);
    const path = await dl.path();
    return { name: dl.suggestedFilename(), path, text: path ? await readFile(path, "utf8") : "" };
  }
}
