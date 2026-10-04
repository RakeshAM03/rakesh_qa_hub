import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { ApiPlaygroundPage } from "./pages/api-playground-page";

test.describe("API Test Playground", () => {
  test("starts with an empty state and an idle response panel", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    await ap.goto();
    await expect(ap.heading("API Test Playground")).toBeVisible();
    await expect(page.getByText("Send a request to see the response here.")).toBeVisible();
  });

  test("sends (mocked), runs assertions and shows pass/fail", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    await ap.mockSend();
    await ap.goto();
    await ap.url.fill("https://httpbin.org/get?show=1");
    await ap.tab("Params");
    await expect(page.getByLabel("Param 1 name")).toHaveValue("show");

    await ap.addAssertion(1, "Status code", { expected: "200" });
    await ap.addAssertion(2, "JSON path", { target: "$.url", operator: "exists" });
    await ap.addAssertion(3, "Header", { target: "Content-Type", operator: "contains", expected: "xml" });
    await ap.send();

    await expect(ap.status).toHaveText(/^200/);
    await expect(page.getByText("2 of 3 passed")).toBeVisible();
    const results = page.getByRole("list", { name: "Assertion results" }).getByRole("listitem");
    await expect(results.nth(0).getByLabel("Passed")).toBeVisible();
    await expect(results.nth(2).getByLabel("Failed")).toBeVisible();
    await expect(results.nth(2)).toContainText("Actual: application/json");
    expect(ap.sent[0]).toMatchObject({ method: "GET", url: "https://httpbin.org/get?show=1" });

    await page.getByRole("tab", { name: "Body" }).last().click();
    await expect(page.getByTestId("json-tree")).toContainText('"https://httpbin.org/get"');
  });

  test("Ctrl/Cmd + Enter sends, and Copy as cURL builds the command", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    await ap.mockSend();
    await ap.goto();
    await page.getByLabel("Method").click();
    await page.getByRole("option", { name: "POST" }).click();
    await ap.url.fill("https://httpbin.org/post");
    await ap.tab("Headers");
    await page.getByRole("button", { name: "Add header" }).click();
    await page.getByLabel("Header 1 name").fill("X-Trace");
    await page.getByLabel("Header 1 value").fill("abc");
    await ap.url.focus();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(ap.status).toBeVisible();
    expect(ap.sent[0].headers).toContainEqual({ key: "X-Trace", value: "abc" });

    await page.getByRole("button", { name: "Copy as cURL" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("curl \\\n  -X POST \\\n  'https://httpbin.org/post' \\\n  -H 'X-Trace: abc'");
  });

  test("blocks private and internal addresses (real send route, SSRF protection)", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    await ap.goto();
    for (const [url, msg] of [
      ["http://127.0.0.1:3100/api/ai/status", /private, loopback or internal addresses are blocked/],
      ["http://169.254.169.254/latest/meta-data/", /private, loopback or internal addresses are blocked/],
      ["http://localhost:3100/", /local or internal hosts are blocked/],
      ["file:///etc/passwd", /Only http and https/],
    ] as const) {
      await ap.url.fill(url);
      await ap.send();
      await expect(page.getByRole("alert").filter({ hasText: msg })).toBeVisible();
    }
  });

  test("sends to a real public API @network", async ({ page }) => {
    test.skip(process.env.E2E_NETWORK !== "1", "Set E2E_NETWORK=1 to call httpbin.org");
    const ap = new ApiPlaygroundPage(page);
    await ap.goto();
    await ap.url.fill("https://httpbin.org/get");
    await ap.addAssertion(1, "Status code", { expected: "200" });
    await ap.send();
    await expect(ap.status).toHaveText(/^200/, { timeout: 20_000 });
    await expect(page.getByText("1 of 1 passed")).toBeVisible();
  });
});

test.describe("API Test Playground @write", () => {
  test("creates a collection, saves a request, edits (unsaved dot), reopens and deletes", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    const collection = `E2E Users ${uid()}`;
    await ap.mockSend();
    await ap.goto();

    await ap.sidebar.getByRole("button", { name: "New Collection" }).click();
    await page.getByLabel("Name").fill(collection);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Collection created");
    await expect(ap.sidebar.getByText(collection)).toBeVisible();

    await ap.url.fill("https://httpbin.org/get");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Save request" });
    await expect(dialog).toContainText("don't save real secrets");
    await dialog.getByLabel("Request name").fill("Get echo");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expectToast(page, "Request saved");
    const row = ap.sidebar.getByRole("list", { name: `${collection} requests` }).getByRole("button", { name: /^GET\s*Get echo/ });
    await expect(row).toContainText("GET");
    await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);

    await ap.url.fill("https://httpbin.org/anything");
    await expect(page.getByTestId("request-name").locator("..").getByLabel("Unsaved changes")).toBeVisible();
    await page.getByRole("button", { name: "New request" }).click();
    await expect(page.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeVisible();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(ap.url).toHaveValue("");

    await page.reload();
    await row.click();
    await expect(ap.url).toHaveValue("https://httpbin.org/get");
    await expect(page.getByTestId("request-name")).toHaveText("Get echo");

    await ap.sidebar.getByRole("button", { name: "Actions for Get echo" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await enterPasscode(page);
    await expectToast(page, "Request deleted");
    await ap.sidebar.getByRole("button", { name: `Actions for ${collection}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expectToast(page, "Collection deleted");
  });

  test("environments substitute {{variables}} and flag unknown ones", async ({ page }) => {
    const ap = new ApiPlaygroundPage(page);
    const envName = `Staging ${uid()}`;
    await ap.mockSend();
    await ap.goto();
    await ap.url.fill("{{baseUrl}}/get?id={{userId}}");
    await expect(page.getByText("Unknown variables: {{baseUrl}}, {{userId}}")).toBeVisible();

    await page.getByRole("button", { name: "Manage environments" }).click();
    await page.getByRole("button", { name: "New environment" }).click();
    await page.getByLabel("Name", { exact: true }).fill(envName);
    await page.getByLabel("Variable 1 value").fill("https://httpbin.org");
    await page.getByRole("button", { name: "Create" }).click();
    await expectToast(page, "Environment saved");
    await page.keyboard.press("Escape");

    await expect(page.getByText(`Unknown variable: {{userId}} (not in “${envName}”)`)).toBeVisible();
    await ap.tab("Params");
    await page.getByLabel("Param 1 value").fill("42");
    await expect(page.getByText(/Unknown variable/)).toHaveCount(0);
    await ap.send();
    await expect(ap.status).toBeVisible();
    expect(ap.sent[0].url).toBe("https://httpbin.org/get?id=42");

    await page.getByRole("button", { name: "Manage environments" }).click();
    await page.getByRole("button", { name: `Delete ${envName}` }).click();
    await enterPasscode(page);
    await expectToast(page, "Environment deleted");
  });
});
