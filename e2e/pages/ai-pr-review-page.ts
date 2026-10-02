import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class AiPrReviewPage extends BasePage {
  constructor(page: Page) {
    super(page, "/ai-pr-review");
  }

  get prUrls() {
    return this.page.getByLabel("PR URLs");
  }
  get generatedPrompt() {
    return this.page.getByLabel("Generated review prompt");
  }
  get claudeOutput() {
    return this.page.getByLabel("Paste Claude's output");
  }
  get previewRows() {
    return this.page.getByTestId("preview-flag");
  }
  get flagRows() {
    return this.page.getByTestId("flag-row");
  }
  get allFlags() {
    return this.page.getByRole("region", { name: "All logged flags" });
  }
  typeFilter(label: RegExp) {
    return this.page.getByRole("group", { name: "Filter by flag type" }).getByRole("button", { name: label });
  }
  severityFilter(name: "All" | "P0" | "P1") {
    return this.page.getByRole("group", { name: "Filter by severity" }).getByRole("button", { name, exact: true });
  }
}
