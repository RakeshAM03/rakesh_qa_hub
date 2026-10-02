import { expect, type Locator, type Page } from "@playwright/test";

/** Shared shell: sidebar, page header, toasts. */
export class BasePage {
  constructor(
    readonly page: Page,
    readonly path: string,
  ) {}

  async goto() {
    await this.page.goto(this.path);
  }

  heading(name: string | RegExp): Locator {
    return this.page.getByRole("heading", { level: 1, name });
  }

  get sidebar() {
    return this.page.getByTestId("app-sidebar");
  }

  sidebarLink(name: string) {
    return this.sidebar.getByRole("link", { name, exact: true });
  }

  async expectToast(text: string | RegExp) {
    await expect(this.page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
  }
}
