import { expect, test } from "@playwright/test";

import { enterPasscode, uid } from "./fixtures/helpers";
import { TcLibraryPage } from "./pages/tc-library-page";

const OUTPUT = "## Step 1 — PR Analysis\nThe PR adds a coupon field.\n\n## Step 2 — Test Plan\n| # | Scenario | Priority |\n|---|---|---|\n| 1 | Valid coupon | P1 |";

test.describe("TC Library @write", () => {
  test("shows the empty state on a fresh library", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    await tc.goto();
    await expect(page.getByText("No saved test plans yet. Click New Entry after Claude completes Step 2.")).toBeVisible();
  });

  test("validates and saves an entry, then views it as Markdown", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    const name = `Checkout Flow ${uid()}`;
    await tc.goto();
    await page.getByRole("button", { name: "New Entry" }).first().click();
    await expect(page.getByRole("button", { name: "Save to Library" })).toBeDisabled();
    await page.getByLabel(/PR Reference/).fill("not a ref");
    await expect(page.getByText(/Use repo #number or a GitHub pull request URL/)).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();

    await tc.create(name, OUTPUT, "my-repo #42");
    await tc.expectToast(`Saved “${name}” to the library`);
    await expect(tc.entries.first()).toContainText(name);

    await tc.entry(name).getByRole("button", { name: "View" }).click();
    const sheet = page.getByRole("dialog", { name });
    await expect(sheet.getByRole("heading", { name: "Step 2 — Test Plan" })).toBeVisible();
    await expect(sheet.getByRole("cell", { name: "Valid coupon" })).toBeVisible();
  });

  test("hints at duplicate names and searches content", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    const name = `Search me ${uid()}`;
    await tc.goto();
    await tc.create(name, "unique-content-token");
    await page.getByRole("button", { name: "New Entry" }).first().click();
    await page.getByRole("textbox", { name: /^Name/ }).fill(name);
    await expect(page.getByText("An entry with this name already exists. You can still save.")).toBeVisible();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Discard" }).click();

    await tc.search("unique-content-token");
    await expect(tc.entries).toHaveCount(1);
    await tc.search("nothing-matches-this");
    await expect(page.getByText(/No entries match/)).toBeVisible();
  });

  test("imports JSON with a preview and reports invalid entries", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    const tag = uid();
    await tc.goto();
    await tc.importJson([{ name: `Imported A ${tag}`, output: "a" }, { name: `Imported B ${tag}`, output: "b" }, { name: "no output" }]);
    const dialog = page.getByRole("dialog", { name: "Import JSON" });
    await expect(dialog.getByText("2 entries ready to import")).toBeVisible();
    await expect(dialog.getByText(/1 entry will be skipped/)).toBeVisible();
    await dialog.getByRole("button", { name: "Import 2" }).click();
    await tc.expectToast("Imported 2 entries");
    await tc.search(tag);
    await expect(tc.entries).toHaveCount(2);
  });

  test("deletes only with the admin passcode", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    const name = `Delete me ${uid()}`;
    await tc.goto();
    await tc.create(name, "x");
    await tc.entry(name).getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await enterPasscode(page, "wrong-passcode");
    await expect(page.getByText("That passcode didn't work. Try again.")).toBeVisible();
    await page.getByRole("textbox", { name: "Passcode" }).fill(process.env.E2E_ADMIN_PASSCODE ?? "e2e-passcode");
    await page.getByRole("button", { name: "Continue" }).click();
    await tc.expectToast(`Deleted “${name}”`);
    await expect(tc.entry(name)).toHaveCount(0);
  });

  test("loads a saved entry into a PR QA Session prompt", async ({ page }) => {
    const tc = new TcLibraryPage(page);
    const name = `Approved plan ${uid()}`;
    await tc.goto();
    await tc.create(name, OUTPUT);
    await page.goto("/pr-qa-session");
    await page.getByLabel("Frontend PR URL").fill("https://github.com/org/web/pull/42");
    await page.getByRole("button", { name: "Load from TC Library" }).click();
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(name) }).click();
    await page.getByRole("button", { name: "Build Prompt" }).click();
    const prompt = page.getByRole("textbox", { name: "Generated prompt" });
    await expect(prompt).toHaveValue(/1\. Analyse the PR — already done and approved/);
    await expect(prompt).toHaveValue(/start from Step 3/);
    await expect(prompt).toHaveValue(new RegExp(`Approved Steps 1–2 \\(from TC Library: ${name}\\)`));
  });
});
