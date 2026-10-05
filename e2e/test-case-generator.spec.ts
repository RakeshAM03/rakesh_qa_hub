import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { enterPasscode, expectToast, uid } from "./fixtures/helpers";
import { TestCaseGeneratorPage } from "./pages/test-case-generator-page";

const STORY = `As a shopper, I want to sign up with my email and password so that I can save my cart.
AC1: A valid email and password create an account
AC2: An email that is already registered shows an error
AC3: The password must be at least 8 characters`;

const ANSWER = {
  summary: "Sign-up for shoppers: account creation, duplicate email and password rules.",
  assumptions: ["Email verification is out of scope"],
  questions: ["Is there a maximum password length?", "Are social logins planned?"],
  testCases: [
    { id: "TC-SU-001", title: "Sign up with valid details", category: "Functional", type: "Positive", priority: "P0", preconditions: "Logged out", testData: "new.user@example.com / Str0ng!Pass", steps: ["Open sign-up", "Enter details", "Submit"], expectedResult: "Account created", gherkin: null, requirementRef: "AC1", automationCandidate: true, api: null },
    { id: "TC-SU-002", title: "Duplicate email is rejected", category: "Functional", type: "Negative", priority: "P1", preconditions: "Account exists", testData: "existing@example.com", steps: ["Enter existing email", "Submit"], expectedResult: "Error shown", gherkin: null, requirementRef: "AC2", automationCandidate: true, api: null },
    { id: "TC-SU-003", title: "Create account API", category: "API", type: "Status codes", priority: "P1", preconditions: "", testData: "", steps: ["POST /users"], expectedResult: "201", gherkin: null, requirementRef: "AC1", automationCandidate: true, api: { method: "POST", endpoint: "/users", headers: { "Content-Type": "application/json" }, body: { email: "a@example.com" }, expectedStatus: 201, assertions: ["status is 201"] } },
  ],
};
const fenced = `Here are the test cases:\n\n\`\`\`json\n${JSON.stringify(ANSWER, null, 2)}\n\`\`\`\n`;

test.describe("Test Case Generator", () => {
  test("starts empty; AI is hidden without a key; prompt needs input", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await expect(page.getByRole("heading", { name: "No test cases yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate with AI" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Copy prompt for Claude" })).toBeDisabled();
    await tc.requirement.fill(STORY);
    await expect(page.getByRole("button", { name: "Copy prompt for Claude" })).toBeEnabled();
  });

  test("checklist from a user story, edit a case, export CSV", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.moreContext("Sign up");
    await tc.checklist();
    await expectToast(page, /Generated \d+ checklist cases/);
    expect(await tc.rows.count()).toBeGreaterThan(8);
    await expect(tc.rows.first()).toContainText("Template");
    await expect(page.getByLabel("Title of TC-SU-001")).toHaveValue("Sign up: main flow succeeds with valid input");
    expect(await tc.titles()).toEqual(expect.arrayContaining(["Email: rejects an address without @", "Password: rejects a password below the minimum length"]));

    await page.getByLabel("Title of TC-SU-001").fill("Sign up succeeds with a valid email and password");
    await page.getByRole("button", { name: "Edit all fields" }).first().click();
    const drawer = page.getByRole("dialog", { name: "Edit TC-SU-001" });
    await drawer.getByLabel("Expected result").fill("The account is created and the shopper is signed in.");
    await page.keyboard.press("Escape");

    const csv = await tc.download("Export CSV");
    expect(csv.name).toBe("sign-up-test-cases.csv");
    expect(csv.text.startsWith("﻿ID,Title,Category,Type,Priority")).toBe(true);
    expect(csv.text).toContain("TC-SU-001,Sign up succeeds with a valid email and password,Functional,Positive,P0");
    expect(csv.text).toContain("The account is created and the shopper is signed in.");
  });

  test("imports a pasted Claude JSON answer; questions, coverage and Gherkin", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer(fenced);
    await expectToast(page, "Imported 3 test cases");
    await expect(tc.rows).toHaveCount(3);
    await expect(page.getByText("Is there a maximum password length?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy questions" })).toBeVisible();
    await expect(page.getByLabel("Summary")).toContainText("API: 1");
    await expect(page.getByText("Automation candidates: 3")).toBeVisible();

    await page.getByRole("button", { name: "Coverage view" }).click();
    const coverage = page.getByRole("table", { name: "Coverage" });
    await expect(coverage.getByRole("row").filter({ hasText: "AC1" })).toContainText("TC-SU-001, TC-SU-003");
    await expect(coverage.locator("tr[data-uncovered]")).toHaveCount(1);
    await expect(coverage.locator("tr[data-uncovered]")).toContainText("AC3");
    await page.getByRole("button", { name: "Coverage view" }).click();

    const feature = await tc.download("Download Gherkin");
    expect(feature.text).toContain("Feature: Feature — Functional");
    expect(feature.text).toContain("@TC-SU-002 @P1 @automation");
    const postman = await tc.download("Export for Postman");
    expect(JSON.parse(postman.text).item).toHaveLength(1);
    const xlsx = await tc.download("Export Excel");
    expect(xlsx.name).toBe("test-cases-test-cases.xlsx");
  });

  test("bad answers show an error; a Markdown table still imports", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer("Sorry, I can't help with that.");
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't find test cases" })).toBeVisible();
    await page.getByLabel("Paste Claude's answer").fill("| ID | Title | Priority | Steps | Expected result |\n|---|---|---|---|---|\n| T-1 | Login works | High | Open; Submit | Dashboard |\n");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(tc.rows).toHaveCount(1);
    await expect(page.getByText(/Imported from a Markdown table/)).toBeVisible();
  });

  test("filters, bulk priority change and delete", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer(fenced);
    await page.getByLabel("Filter by category").click();
    await page.getByRole("option", { name: "API", exact: true }).click();
    await expect(tc.rows).toHaveCount(1);
    await page.getByLabel("Filter by category").click();
    await page.getByRole("option", { name: "All categories" }).click();
    await page.getByLabel("Select TC-SU-001").click();
    await page.getByLabel("Select TC-SU-002").click();
    await page.getByLabel("Change priority of selected").click();
    await page.getByRole("option", { name: "P3" }).click();
    await expect(page.getByLabel("Summary")).toContainText("P3: 2");
    await page.getByRole("button", { name: "Delete selected" }).click();
    await expect(tc.rows).toHaveCount(1);
  });

  test("row menu moves, duplicates and deletes a case", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer(fenced);
    const ids = () => page.locator('input[aria-label^="ID of "]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    await page.getByRole("button", { name: "More actions for TC-SU-002" }).click();
    await page.getByRole("menuitem", { name: "Move up" }).click();
    expect(await ids()).toEqual(["TC-SU-002", "TC-SU-001", "TC-SU-003"]);
    await page.getByRole("button", { name: "More actions for TC-SU-001" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    expect(await ids()).toEqual(["TC-SU-002", "TC-SU-001", "TC-SU-001-copy", "TC-SU-003"]);
    await page.getByRole("button", { name: "More actions for TC-SU-003" }).click();
    await expect(page.getByRole("menuitem", { name: "Move down" })).toBeDisabled();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    expect(await ids()).toEqual(["TC-SU-002", "TC-SU-001", "TC-SU-001-copy"]);
  });

  test("OpenAPI spec in the API tab gives per-endpoint cases", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await page.getByRole("tab", { name: "API definition" }).click();
    await page.getByLabel("OpenAPI / Swagger (JSON or YAML) or a cURL command").fill(readFileSync("tests/fixtures/tcgen/orders-api.yaml", "utf8"));
    await page.getByRole("button", { name: "Clear", exact: true }).click();
    await page.getByRole("button", { name: "API complete" }).click();
    await tc.checklist();
    await expect(tc.rows.first()).toBeVisible();
    expect(await tc.titles()).toEqual(expect.arrayContaining(["POST /orders: valid request returns 201", 'POST /orders: missing required field "customerEmail" is rejected', "GET /orders: missing token returns 401"]));
  });
});

test.describe("Test Case Generator @write", () => {
  test("saves to TC Library and the entry appears there", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    const name = `E2E cases ${uid()}`;
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer(fenced);
    await page.getByRole("button", { name: "Save to TC Library" }).click();
    const dialog = page.getByRole("dialog", { name: "Save to TC Library" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save to TC Library" }).click();
    await expectToast(page, `Saved “${name}” to TC Library`);
    await page.goto("/tc-library");
    const entry = page.getByTestId("tc-entry").filter({ hasText: name });
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("Sign-up for shoppers");
  });

  test("sends API cases to the API Playground as a collection", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.moreContext(`E2E send ${uid()}`);
    await tc.importAnswer(fenced);
    await page.getByRole("button", { name: "Send to API Playground" }).click();
    await expectToast(page, "Created an API Playground collection with 1 requests");
  });

  test("saves a generation, reopens it from History and deletes it", async ({ page }) => {
    const tc = new TestCaseGeneratorPage(page);
    const name = `E2E generation ${uid()}`;
    await tc.goto();
    await tc.requirement.fill(STORY);
    await tc.importAnswer(fenced);
    await page.getByRole("button", { name: "Save generation" }).click();
    const dialog = page.getByRole("dialog", { name: "Save generation" });
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expectToast(page, "Generation saved");
    await expect(page.getByText(`Saved as ${name}`)).toBeVisible();

    await tc.goto();
    await page.getByRole("button", { name: "History" }).click();
    const item = page.getByRole("list", { name: "Saved generations" }).getByRole("listitem").filter({ hasText: name });
    await expect(item).toContainText("3 cases · 2 functional · 0 non-functional · 1 API");
    await item.getByRole("button", { name: `Open ${name}` }).click();
    await expect(tc.rows).toHaveCount(3);
    await expect(tc.requirement).toHaveValue(STORY);

    await page.getByRole("button", { name: "History" }).click();
    await item.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete generation" }).click();
    await enterPasscode(page);
    await expectToast(page, `Deleted “${name}”`);
    await expect(item).toHaveCount(0);
  });
});
