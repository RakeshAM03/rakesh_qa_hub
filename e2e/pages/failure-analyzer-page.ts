import { type Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class FailureAnalyzerPage extends BasePage {
  constructor(page: Page) {
    super(page, "/failure-analyzer");
  }

  section(label: RegExp | string) {
    return this.page.getByRole("region", { name: label });
  }
  get clusters() {
    return this.page.getByTestId("fa-cluster");
  }
  get verdict() {
    return this.page.getByTestId("fa-verdict");
  }

  async pasteSampleAndAnalyze() {
    await this.page.getByRole("button", { name: "Load sample" }).click();
    await this.analyze();
  }
  async analyze() {
    await this.page.getByRole("button", { name: "Analyze", exact: true }).click();
  }
  async upload(files: { name: string; content: string }[]) {
    await this.page.getByRole("tab", { name: "Upload report" }).click();
    await this.page.getByTestId("fa-file-input").setInputFiles(files.map((f) => ({ name: f.name, mimeType: "text/plain", buffer: Buffer.from(f.content) })));
  }
}
