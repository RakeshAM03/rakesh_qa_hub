import { type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class LocatorHelperPage extends BasePage {
  constructor(page: Page) {
    super(page, "/locator-helper");
  }

  get htmlInput() {
    return this.page.getByRole("textbox", { name: "HTML input" });
  }
  get tree() {
    return this.page.getByRole("list", { name: "Elements" });
  }
  get suggestions() {
    return this.page.getByRole("list", { name: "Locator suggestions" }).getByRole("article");
  }

  async loadSample() {
    await this.page.getByRole("button", { name: "Load sample" }).click();
  }

  async pasteAndParse(html: string) {
    await this.htmlInput.fill(html);
    await this.page.getByRole("button", { name: "Parse" }).click();
  }

  treeNode(label: string | RegExp) {
    return this.tree.getByRole("button", { name: label });
  }

  async testLocator(selector: string) {
    await this.page.getByRole("tab", { name: "Test a locator" }).click();
    await this.page.getByLabel("CSS selector or XPath").fill(selector);
  }
}
