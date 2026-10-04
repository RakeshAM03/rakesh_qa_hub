import { type Page, type Route } from "@playwright/test";

import { BasePage } from "./base-page";

export type MockResponse = { status?: number; headers?: [string, string][]; body?: string; timeMs?: number };

export class ApiPlaygroundPage extends BasePage {
  /** Payloads the page sent to /api/api-playground/send (when mocked). */
  sent: { method: string; url: string; headers: { key: string; value: string }[]; body?: string }[] = [];

  constructor(page: Page) {
    super(page, "/api-playground");
  }

  get sidebar() {
    return this.page.getByRole("complementary", { name: "Collections" });
  }
  get url() {
    return this.page.getByLabel("URL", { exact: true });
  }
  get status() {
    return this.page.getByTestId("response-status");
  }

  /** Replaces the outbound proxy with a canned response (CI has no reliable network). */
  async mockSend(res: MockResponse = {}) {
    await this.page.route("**/api/api-playground/send", async (route: Route) => {
      this.sent.push(route.request().postDataJSON());
      const body = res.body ?? JSON.stringify({ url: "https://httpbin.org/get", args: {}, headers: { Accept: "*/*" } });
      await route.fulfill({
        json: {
          response: {
            status: res.status ?? 200,
            statusText: "OK",
            headers: res.headers ?? [["content-type", "application/json"]],
            body,
            timeMs: res.timeMs ?? 123,
            sizeBytes: body.length,
            truncated: false,
            finalUrl: this.sent.at(-1)?.url ?? "",
            redirects: [],
          },
        },
      });
    });
  }

  async tab(name: string) {
    await this.page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  }

  async addAssertion(i: number, type: string, opts: { target?: string; operator?: string; expected?: string } = {}) {
    await this.tab("Assertions");
    await this.page.getByRole("button", { name: "Add assertion" }).click();
    if (type !== "Status code") {
      await this.page.getByLabel(`Assertion ${i} type`).click();
      await this.page.getByRole("option", { name: type, exact: true }).click();
    }
    if (opts.target !== undefined) await this.page.getByLabel(`Assertion ${i} target`).fill(opts.target);
    if (opts.operator) {
      await this.page.getByLabel(`Assertion ${i} operator`).click();
      await this.page.getByRole("option", { name: opts.operator, exact: true }).click();
    }
    if (opts.expected !== undefined) await this.page.getByLabel(`Assertion ${i} expected`).fill(opts.expected);
  }

  async send() {
    await this.page.getByRole("button", { name: "Send", exact: true }).click();
  }
}
