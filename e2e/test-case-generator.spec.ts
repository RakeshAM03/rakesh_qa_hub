import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { TestCaseGeneratorPage } from "./pages/test-case-generator-page";

const sample = (name: string) => readFileSync(`tests/fixtures/tcgen/requirements/${name}`, "utf8").trim();
const LOGIN = sample("2-login.txt");

const STORY = `As a shopper, I want to sign up with my email and password so that I can save my cart.
AC1: A valid email and password create an account
AC2: An email that is already registered shows an error
AC3: The password must be at least 8 characters`;

const tc = (id: string, title: string, category: string, type: string, priority: string, ref = "", api: unknown = null) => ({
  id,
  title,
  category,
  type,
  priority,
  automation: "Yes",
  preconditions: ["The application is up in the QA environment.", "User is logged out.", "The sign-up page is open.", "No account exists for the test email."],
  steps: ["Open the sign-up page.", "Enter the email.", "Enter the password.", "Click 'Sign up'.", "Refresh and check the account."],
  testData: ["Email: new.user@example.com", "Password: Str0ng!Pass"],
  expectedResult: ["The account is created.", "Message shown: 'Welcome'.", "The account persists after refresh.", "No duplicate account is created."],
  gherkin: null,
  requirementRef: ref,
  api,
});

const ANSWER = {
  summary: "Sign-up: account creation, duplicate email and password rules.",
  requirementRules: ["Email must be unique", "Password at least 8 characters"],
  assumptions: ["Email verification is out of scope"],
  questions: ["Is there a maximum password length? (TC_SU_003)", "Are social logins planned?"],
  testCases: [
    tc("TC_SU_001", "Verify sign up succeeds with a valid email and password", "Functional", "Positive", "P1 - Critical", "AC1"),
    tc("TC_SU_002", "Verify an email that is already registered is rejected", "Validation", "Negative", "P2 - High", "AC2"),
    tc("TC_SU_003", "Verify POST /users returns 201 for a valid body", "API", "Positive", "P2 - High", "AC1", { method: "POST", endpoint: "/users", headers: { "Content-Type": "application/json" }, body: { email: "a@example.com" }, expectedStatus: 201, assertions: ["status is 201"] }),
  ],
};
const fenced = `Here are the test cases:\n\n\`\`\`json\n${JSON.stringify(ANSWER, null, 2)}\n\`\`\`\n`;

test.describe("Test Case Generator", () => {
  test("starts empty with Everything and Standard selected; AI hidden without a key", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await expect(page.getByRole("heading", { name: "No test cases yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate with AI" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy prompt for Claude" })).toBeDisabled();
    for (const name of ["Positive (happy path)", "Security", "Status codes", "Contract / backward compatibility"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await expect(page.getByLabel("Depth")).toHaveText(/Standard/);
    await expect(page.getByLabel("Priority scheme")).toHaveText(/P1 - Critical/);
  });

  test("login sample → checklist → quality ≥ 80 → Excel with three sheets", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(LOGIN);
    await tcg.checklist();
    await expectToast(page, /Generated \d+ checklist cases/);
    expect(await tcg.rows.count()).toBeGreaterThanOrEqual(25);
    const score = Number((await page.getByTestId("quality-score").innerText()).match(/\d+/)![0]);
    expect(score).toBeGreaterThanOrEqual(80);
    await expect(page.getByRole("list", { name: "Rules found" })).toContainText("Account locks after 5 failed attempts for 15 minutes");
    expect(await tcg.titles()).toEqual(expect.arrayContaining(["Verify the account is locked after 5 consecutive failed attempts", "Verify Password with 21 characters (max + 1) is rejected"]));
    await expect(page.locator('input[aria-label^="ID of "]').first()).toHaveValue("TC_LOG_001");

    const xlsx = await tcg.download("Export Excel");
    expect(xlsx.name).toBe("Login_Test_Cases.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(readFileSync(xlsx.path!) as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Test Cases", "Summary", "Assumptions & Queries"]);
    expect(wb.getWorksheet("Test Cases")!.getRow(1).values).toEqual([undefined, "ID", "Title", "Category", "Type", "Priority", "Automation", "Preconditions", "Steps", "Test data", "Expected result"]);
  });

  test("checklist from a user story: edit a case in the drawer, export CSV", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.moreContext("Sign up");
    await tcg.checklist();
    const first = page.locator('input[aria-label^="ID of "]').first();
    await expect(first).toHaveValue(/^TC_SU_\d{3}$/);
    const id = await first.inputValue();
    await page.getByLabel(`Title of ${id}`).fill("Verify sign up succeeds with a valid email and password");
    await page.getByRole("button", { name: "Edit all fields" }).first().click();
    const drawer = page.getByRole("dialog", { name: `Edit ${id}` });
    await drawer.getByLabel("Expected result (numbered lines)").fill("1. The account is created.\n2. The user is signed in.\n3. A welcome email is sent.");
    await page.keyboard.press("Escape");

    const csv = await tcg.download("Export CSV");
    expect(csv.name).toBe("sign-up-test-cases.csv");
    expect(csv.text.startsWith("﻿ID,Title,Category,Type,Priority,Automation,Preconditions,Steps,Test data,Expected result")).toBe(true);
    expect(csv.text).toContain(`${id},Verify sign up succeeds with a valid email and password,`);
    expect(csv.text).toContain("3. A welcome email is sent.");
  });

  test("imports a pasted AI JSON answer with a quality score, questions, coverage and Gherkin", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.importAnswer(fenced);
    await expectToast(page, "Imported 3 test cases");
    await expect(tcg.rows).toHaveCount(3);
    await expect(page.getByTestId("quality-score")).toHaveText(/Quality score: \d+/);
    await expect(page.getByText("Is there a maximum password length? (TC_SU_003)")).toBeVisible();
    await expect(page.getByLabel("Summary")).toContainText("API: 1");
    await expect(page.getByLabel("Summary")).toContainText("P2 - High: 2");

    await page.getByRole("button", { name: "Coverage view" }).click();
    const coverage = page.getByRole("table", { name: "Coverage" });
    await expect(coverage.getByRole("row").filter({ hasText: "AC1" })).toContainText("TC_SU_001, TC_SU_003");
    await expect(coverage.locator("tr[data-uncovered]")).toContainText("AC3");
    await page.getByRole("button", { name: "Coverage view" }).click();

    const feature = await tcg.download("Download Gherkin");
    expect(feature.text).toContain("@TC_SU_002 @P2 @negative @automation");
    const postman = await tcg.download("Export for Postman");
    expect(JSON.parse(postman.text).item).toHaveLength(1);
  });

  test("weak rows are flagged, filterable, and the improve prompt can be copied", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    const weak = { ...ANSWER, testCases: [...ANSWER.testCases, { ...ANSWER.testCases[0], id: "TC_SU_004", title: "Check the feature works correctly", testData: [], steps: ["Open", "Click"] }] };
    await tcg.importAnswer(JSON.stringify(weak));
    await expect(page.locator("tr[data-weak]")).toHaveCount(1);
    await expect(page.locator("tr[data-weak]")).toContainText("Weak");
    await page.getByText("Weak rows only (1)").click();
    await expect(tcg.rows).toHaveCount(1);
    await page.getByRole("button", { name: "Copy improve prompt" }).click();
    await expect(page.getByLabel("Prompt", { exact: true })).toHaveValue(/TC_SU_004: test data is empty; fewer than 5 steps/);
  });

  test("bad answers show an error; a Markdown table still imports", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.importAnswer("Sorry, I can't help with that.");
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't find test cases" })).toBeVisible();
    await page.getByLabel("Paste Claude's answer").fill("| ID | Title | Priority | Steps | Expected result |\n|---|---|---|---|---|\n| T-1 | Verify login works | High | Open; Submit | Dashboard |\n");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(tcg.rows).toHaveCount(1);
    await expect(page.getByText(/Imported from a Markdown table/)).toBeVisible();
  });

  test("filters, bulk priority change, row menu and delete", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.importAnswer(fenced);
    await page.getByLabel("Filter by category").click();
    await page.getByRole("option", { name: "API", exact: true }).click();
    await expect(tcg.rows).toHaveCount(1);
    await page.getByLabel("Filter by category").click();
    await page.getByRole("option", { name: "All categories" }).click();
    await page.getByLabel("Select TC_SU_001").click();
    await page.getByLabel("Select TC_SU_002").click();
    await page.getByLabel("Change priority of selected").click();
    await page.getByRole("option", { name: "P4 - Low" }).click();
    await expect(page.getByLabel("Summary")).toContainText("P4 - Low: 2");
    await page.getByRole("button", { name: "Delete selected" }).click();
    await expect(tcg.rows).toHaveCount(1);
    await page.getByRole("button", { name: "More actions for TC_SU_003" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(tcg.rows).toHaveCount(2);
  });

  test("OpenAPI spec in the API tab gives per-endpoint cases", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await page.getByRole("tab", { name: "API definition" }).click();
    await page.getByLabel("OpenAPI / Swagger (JSON or YAML) or a cURL command").fill(readFileSync("tests/fixtures/tcgen/orders-api.yaml", "utf8"));
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "API complete" }).click();
    await tcg.checklist();
    await expect(tcg.rows.first()).toBeVisible();
    expect(await tcg.titles()).toEqual(expect.arrayContaining(["Verify POST /orders with a valid request returns 201 and creates the order", "Verify POST /orders without the required field 'customerEmail' returns 400"]));
  });
});

test.describe("Test Case Generator @write", () => {
  test("saves to TC Library and the entry appears there", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    const name = `E2E cases ${uid()}`;
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.importAnswer(fenced);
    await page.getByRole("button", { name: "Save to TC Library" }).click();
    const dialog = page.getByRole("dialog", { name: "Save to TC Library" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save to TC Library" }).click();
    await expectToast(page, `Saved “${name}” to TC Library`);
    await page.goto("/tc-library");
    const entry = page.getByTestId("tc-entry").filter({ hasText: name });
    await expect(entry).toContainText("Sign-up: account creation");
  });

  test("sends API cases to the API Playground as a collection", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.moreContext(`E2E send ${uid()}`);
    await tcg.importAnswer(fenced);
    await page.getByRole("button", { name: "Send to API Playground" }).click();
    await expectToast(page, "Created an API Playground collection with 1 requests");
  });

  test("saves a generation, reopens it from History and deletes it", async ({ page }) => {
    const tcg = new TestCaseGeneratorPage(page);
    const name = `E2E generation ${uid()}`;
    await tcg.goto();
    await tcg.requirement.fill(STORY);
    await tcg.importAnswer(fenced);
    await page.getByRole("button", { name: "Save generation" }).click();
    const dialog = page.getByRole("dialog", { name: "Save generation" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Generation saved");

    await tcg.goto();
    await page.getByRole("button", { name: "History" }).click();
    const item = page.getByRole("list", { name: "Saved generations" }).getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("3 cases · 2 positive · 1 negative · 1 API");
    await item.getByRole("button", { name: `Open ${name}` }).click();
    await expect(tcg.rows).toHaveCount(3);
    await expect(page.getByRole("list", { name: "Rules found" })).toContainText("Email must be unique");

    await page.getByRole("button", { name: "History" }).click();
    await item.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete generation" }).click();
    await enterPasscode(page);
    await expectToast(page, `Deleted “${name}”`);
    await expect(item).toHaveCount(0);
  });
});
