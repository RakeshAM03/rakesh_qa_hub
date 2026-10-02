import type { Page } from "@playwright/test";

import { BasePage } from "./base-page";

export class CiReportsPage extends BasePage {
  constructor(page: Page) {
    super(page, "/ci");
  }

  section(name: string) {
    return this.page.getByRole("region", { name: `CI Reports — ${name}` });
  }
  get jumpBar() {
    return this.page.getByRole("navigation", { name: "Jump to suite" });
  }

  async openAddSuite() {
    await this.page.getByRole("button", { name: "Add suite" }).first().click();
  }

  async fillSuite(values: { name: string; repo: string; workflow: string; color?: string }) {
    const dialog = this.page.getByRole("dialog");
    await dialog.getByLabel(/Display name/).fill(values.name);
    await dialog.getByLabel(/GitHub repo/).fill(values.repo);
    await dialog.getByLabel(/Workflow file/).fill(values.workflow);
    if (values.color) await dialog.getByRole("radio", { name: values.color }).click();
  }
}
