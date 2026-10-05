import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class PrQaSessionPage extends BasePage {
  constructor(page: Page) {
    super(page, "/pr-qa-session");
  }

  get frontendPr() {
    return this.page.getByLabel("Frontend PR URL");
  }
  get backendPr() {
    return this.page.getByLabel("Backend PR URL");
  }
  get buildButton() {
    return this.page.getByRole("button", { name: "Build Prompt" });
  }
  get output() {
    return this.page.getByRole("textbox", { name: "Generated prompt" });
  }
  template(name: string) {
    return this.page.getByRole("group", { name: "Templates" }).getByRole("button", { name, exact: true });
  }
  step(name: RegExp) {
    return this.page.getByRole("group", { name: /Steps/ }).getByRole("button", { name });
  }

  /** Step numbers of the "## Step N — …" headings in the generated prompt. */
  async stepNumbers() {
    const text = await this.output.inputValue();
    return [...text.matchAll(/^## Step (\d+) —/gm)].map((m) => Number(m[1]));
  }
}
